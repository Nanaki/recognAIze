/**
 * `npm run eval` — la gate de vérité du projet : prouve le rang EXACT sur les
 * 4 étalons (`ownership.blocking` faux ET vrai), les 5 fixtures négatives
 * infirmées, l'anti-richesse, la garde anti-littéral, la garde "path_id
 * orphelin", le déterminisme, deux scénarios Ownership construits, et la
 * cohérence seuil-cité/seuil-chargé — avant toute marche fine
 * (`.claude/rules/fiabilite.md`).
 *
 * Utilise `src/analyze.ts` EN PROCESSUS pour la boucle rapide (4 profils ×
 * 2 réglages Ownership, cross-check de seuils, scénarios Ownership
 * synthétiques) — pas de sous-processus, pas de build requis pour cette
 * partie. Valide EN PLUS le binaire construit réellement (`dist/cli.js`, deux
 * sous-processus par profil pour le déterminisme) — jamais les sources TS
 * directement pour cette partie, conformément à « eval écrit dans un
 * répertoire temporaire, jamais dans recognaize-cli-out/ » : tout `--out` de ce
 * script pointe sous `os.tmpdir()`.
 *
 * `npm run build` doit avoir tourné avant (`dist/cli.js` doit exister). Sans
 * `dist/cli.js`, ce script échoue immédiatement en le nommant plutôt que de
 * sauter silencieusement la partie binaire réel.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runAnalysis } from "../src/analyze.js";
import { judge, type JudgeResult } from "../src/core/judge.js";
import { loadReferentiel, thresholdFor, type Referentiel, type ThresholdExpr } from "../src/core/referentiel.js";
import type { AxeId, Etat, Evidence, Force, Polarite, ProfileContext, Rang, SourceId } from "../src/core/types.js";
import { RANGS_ORDONNES } from "../src/core/types.js";
import { findAntiLiteralViolations, formatAntiLiteralViolation } from "./anti-literal.js";
import { runAblationChecks } from "./ablation.js";
import { runAntecedenceGuard, runHoldoutChecks, type HoldoutFile } from "./holdout.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

const failures: string[] = [];
function fail(message: string): void {
  failures.push(message);
  process.stderr.write(`[eval] ÉCHEC : ${message}\n`);
}
function pass(message: string): void {
  process.stdout.write(`[eval] OK : ${message}\n`);
}

// ---------------------------------------------------------------------------
// Chargement des fixtures d'eval
// ---------------------------------------------------------------------------

interface ExpectedFile {
  readonly profiles: Record<string, { readonly rang_affiche: Rang }>;
}
interface NegativeFile {
  readonly negatives: readonly { readonly profile: string; readonly marche: string }[];
  readonly anti_richesse: { readonly below: string; readonly above: readonly string[] };
}

const expected = JSON.parse(readFileSync(join(REPO_ROOT, "evals", "expected.json"), "utf8")) as ExpectedFile;
const negative = JSON.parse(readFileSync(join(REPO_ROOT, "evals", "negative.json"), "utf8")) as NegativeFile;
const holdout = JSON.parse(readFileSync(join(REPO_ROOT, "evals", "holdout.json"), "utf8")) as HoldoutFile;

const PROFILE_NAMES = Object.keys(expected.profiles);

function profileDir(name: string): string {
  return join(REPO_ROOT, "fixtures", "profiles", name);
}

// ---------------------------------------------------------------------------
// 1. Garde anti-littéral — voir `evals/anti-literal.ts` pour la règle exacte
//    (scan par AST de `src/checks/**` et `src/lib/**`, tolérance 0/1 stricte
//    côté checks, exemption `anti-littéral-lib:` justifiée côté lib).
// ---------------------------------------------------------------------------

function runAntiLiteralGuard(): void {
  const checksDirAbs = join(REPO_ROOT, "src", "checks");
  const libDirAbs = join(REPO_ROOT, "src", "lib");
  const srcAbs = join(REPO_ROOT, "src");
  const violations = [...findAntiLiteralViolations(checksDirAbs, srcAbs), ...findAntiLiteralViolations(libDirAbs, srcAbs)];
  if (violations.length === 0) {
    pass("anti-littéral : aucun littéral numérique hors 0/1 sous src/checks/ et src/lib/ (hors exemptions justifiées de src/lib/).");
    return;
  }
  for (const violation of violations) {
    fail(`anti-littéral : ${formatAntiLiteralViolation(violation)}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Garde "path_id orphelin" : tout chemin de preuve du référentiel doit
//    être couvert par au moins un check du registre (core/registry.ts le
//    calcule déjà comme un avertissement non bloquant — cette garde le
//    transforme en échec d'eval, nommant chaque path_id orphelin).
// ---------------------------------------------------------------------------

function runOrphanPathIdGuard(registryWarnings: readonly string[]): void {
  if (registryWarnings.length === 0) {
    pass("path_id orphelin : chaque marche non défaut a au moins un check qui la couvre.");
    return;
  }
  for (const warning of registryWarnings) {
    fail(`path_id orphelin : ${warning}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Boucle principale : les 4 étalons, Ownership faux/vrai, via
//    `src/analyze.ts` en processus.
// ---------------------------------------------------------------------------

interface MainRun {
  readonly profile: string;
  readonly ctx: ProfileContext;
  readonly evidence: readonly Evidence[];
  readonly referentiel: Referentiel;
  readonly resultBlockingFalse: JudgeResult;
  readonly resultBlockingTrue: JudgeResult;
  readonly registryWarnings: readonly string[];
}

function referenceSourcesOf(ctx: ProfileContext): ReadonlySet<SourceId> {
  const present = new Set<SourceId>();
  if (ctx.gitActivity !== undefined) present.add("GA");
  if (ctx.pullRequests !== undefined) present.add("PR");
  if (ctx.repoContext !== undefined) present.add("RC");
  if (ctx.session !== undefined) present.add("S");
  if (ctx.sonarMeasures !== undefined) present.add("SO");
  if (ctx.declaratif !== undefined) present.add("DEC");
  return present;
}

function runMainMatrix(): readonly MainRun[] {
  const runs: MainRun[] = [];
  for (const profile of PROFILE_NAMES) {
    const outcome = runAnalysis(profileDir(profile), profile, { includeExperimentalLlm: false });
    const referenceSourcesPresentes = referenceSourcesOf(outcome.ctx);

    const blockingTrueReferentiel: Referentiel = {
      ...outcome.referentiel,
      ownership: { ...outcome.referentiel.ownership, blocking: true },
    };
    const resultBlockingTrue = judge({
      referentiel: blockingTrueReferentiel,
      evidence: outcome.evidence,
      hasAiUsageProof: outcome.hasAiUsageProof,
      referenceSourcesPresentes,
    });

    runs.push({
      profile,
      ctx: outcome.ctx,
      evidence: outcome.evidence,
      referentiel: outcome.referentiel,
      resultBlockingFalse: outcome.judgeResult,
      resultBlockingTrue,
      registryWarnings: outcome.registry.warnings,
    });
  }
  return runs;
}

function checkExpectedRanks(runs: readonly MainRun[]): void {
  for (const run of runs) {
    const wanted = expected.profiles[run.profile]?.rang_affiche;
    if (wanted === undefined) {
      fail(`expected.json ne connaît pas le profil "${run.profile}".`);
      continue;
    }
    for (const [label, result] of [
      ["ownership.blocking=false", run.resultBlockingFalse],
      ["ownership.blocking=true", run.resultBlockingTrue],
    ] as const) {
      if (result.rang_affiche === wanted) {
        pass(`${run.profile} (${label}) : rang_affiche = "${wanted}" — exact.`);
      } else {
        fail(
          `${run.profile} (${label}) : rang_affiche = "${String(result.rang_affiche)}", attendu "${wanted}".`,
        );
      }
    }
  }
}

function checkNegativeFixtures(runs: readonly MainRun[]): void {
  const byProfile = new Map(runs.map((run) => [run.profile, run]));
  for (const { profile, marche } of negative.negatives) {
    const run = byProfile.get(profile);
    if (run === undefined) {
      fail(`fixture négative : profil "${profile}" absent de la boucle principale.`);
      continue;
    }
    const axeId = marche.charAt(0) as AxeId;
    const axis = run.resultBlockingFalse.axes.find((a) => a.axe === axeId);
    const etat: Etat | undefined = axis?.etats.find((e) => e.marche === marche)?.etat;
    if (etat === "infirmé") {
      pass(`fixture négative ${profile}/${marche} : infirmée.`);
    } else {
      fail(`fixture négative ${profile}/${marche} : état = "${String(etat)}", attendu "infirmé".`);
    }
  }
}

function checkAntiRichesse(runs: readonly MainRun[]): void {
  const byProfile = new Map(runs.map((run) => [run.profile, run]));
  const belowRun = byProfile.get(negative.anti_richesse.below);
  if (belowRun === undefined) {
    fail(`anti-richesse : profil "${negative.anti_richesse.below}" absent.`);
    return;
  }
  const belowIndex = RANGS_ORDONNES.indexOf(belowRun.resultBlockingFalse.rang_affiche ?? "white");
  for (const aboveName of negative.anti_richesse.above) {
    const aboveRun = byProfile.get(aboveName);
    if (aboveRun === undefined) {
      fail(`anti-richesse : profil "${aboveName}" absent.`);
      continue;
    }
    const aboveIndex = RANGS_ORDONNES.indexOf(aboveRun.resultBlockingFalse.rang_affiche ?? "white");
    if (belowIndex < aboveIndex) {
      pass(`anti-richesse : ${negative.anti_richesse.below} (${belowRun.resultBlockingFalse.rang_affiche}) < ${aboveName} (${aboveRun.resultBlockingFalse.rang_affiche}).`);
    } else {
      fail(
        `anti-richesse : ${negative.anti_richesse.below} (${belowRun.resultBlockingFalse.rang_affiche}) devrait être STRICTEMENT sous ${aboveName} (${aboveRun.resultBlockingFalse.rang_affiche}).`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Aucun état "compris" (réservé à l'entretien, hors périmètre de ce run).
// ---------------------------------------------------------------------------

function checkNoComprisEtat(runs: readonly MainRun[]): void {
  let found = false;
  for (const run of runs) {
    for (const result of [run.resultBlockingFalse, run.resultBlockingTrue]) {
      for (const axis of result.axes) {
        for (const { marche, etat } of axis.etats) {
          if (etat === "compris") {
            fail(`état "compris" trouvé : ${run.profile}, axe ${axis.axe}, marche ${marche} — réservé à l'entretien, hors périmètre de ce run.`);
            found = true;
          }
        }
      }
      for (const { marche, etat } of result.ownership.etats) {
        if (etat === "compris") {
          fail(`état "compris" trouvé : ${run.profile}, Ownership, marche ${marche}.`);
          found = true;
        }
      }
    }
  }
  if (!found) {
    pass('aucune Evidence ni verdict ne porte l\'état "compris" dans ce run.');
  }
}

// ---------------------------------------------------------------------------
// 5. Cross-check seuil cité / seuil chargé : chaque `Evidence` citant un
//    chemin de preuve doit citer une valeur dérivée de `thresholdFor(path_id)`
//    du référentiel réellement chargé — en plus de la garde statique
//    anti-littéral. Quelques checks à contre-preuve manuelle (T4, H2-H5 côté
//    GA) construisent leur citation de contre-preuve en texte libre plutôt
//    que via `formatExprCitation` (voir leur docstring, Phase 2/4) : leur
//    branche PREUVE reste, elle, vérifiable normalement — allowlist
//    documentée plutôt qu'un faux échec.
// ---------------------------------------------------------------------------

const MANUAL_CITATION_CHECK_IDS: ReadonlySet<string> = new Set([
  "T4.git-activity",
  "H2.git-activity",
  "H3.git-activity",
  "H4.git-activity",
  "H5.git-activity",
]);

function formatThresholdLeafValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "oui" : "non";
  return String(value);
}

function collectLeafValues(expr: ThresholdExpr): readonly (string | number | boolean)[] {
  if (expr.kind === "condition") return [expr.value];
  return expr.of.flatMap(collectLeafValues);
}

function checkThresholdCitations(runs: readonly MainRun[]): void {
  let checkedCount = 0;
  let mismatchCount = 0;
  for (const run of runs) {
    for (const evidence of run.evidence) {
      if (evidence.citation === undefined) continue;
      if (MANUAL_CITATION_CHECK_IDS.has(evidence.check_id)) continue;
      let expr: ThresholdExpr;
      try {
        expr = thresholdFor(run.referentiel, evidence.path_id);
      } catch {
        fail(`cross-check seuil : "${evidence.path_id}" (check "${evidence.check_id}") absent de thresholdFor du référentiel chargé.`);
        mismatchCount += 1;
        continue;
      }
      const leaves = collectLeafValues(expr).map(formatThresholdLeafValue);
      checkedCount += 1;
      if (!leaves.some((leaf) => evidence.citation?.includes(leaf) === true)) {
        fail(
          `cross-check seuil : Evidence "${evidence.id}" (path_id "${evidence.path_id}", check "${evidence.check_id}") cite "${evidence.citation}", qui ne contient aucune valeur de thresholdFor (${leaves.join(", ")}).`,
        );
        mismatchCount += 1;
      }
    }
  }
  if (mismatchCount === 0) {
    pass(`cross-check seuil cité/chargé : ${checkedCount} Evidence vérifiées, toutes cohérentes avec thresholdFor(referentiel chargé).`);
  }
}

// ---------------------------------------------------------------------------
// 6. Deux scénarios Ownership construits, DANS L'EVAL (pas seulement en test
//    unitaire) : "rang officiel Copper, Ownership prouvé Red" -> Green avec
//    la mention ; Ownership inconnu -> aucun rabais.
// ---------------------------------------------------------------------------

let syntheticIdCounter = 0;
function syntheticEvidence(options: {
  readonly path_id: string;
  readonly axe: AxeId;
  readonly source?: SourceId;
  readonly polarite?: Polarite;
  readonly force?: Force;
}): Evidence {
  syntheticIdCounter += 1;
  return {
    id: `eval-synthetic-${syntheticIdCounter}`,
    signal_id: "GA.size_median",
    valeur: { type: "enum", unite: "taille_bucket" },
    source: options.source ?? "GA",
    check_id: "eval.synthetic",
    path_id: options.path_id,
    concept_id: options.path_id.split(".")[0] ?? options.path_id,
    axe: options.axe,
    polarite: options.polarite ?? "preuve",
    force: options.force ?? "prouve",
    confiance_source: 1,
  };
}

/** Evidence minimale pour atteindre Copper sur les 4 axes officiels (même construction que test/judge.unit.test.ts). */
function copperEvidence(): Evidence[] {
  return [
    syntheticEvidence({ path_id: "T2.p1", axe: "T" }),
    syntheticEvidence({ path_id: "T3.p1", axe: "T" }),
    syntheticEvidence({ path_id: "H2.p2", axe: "H" }),
    syntheticEvidence({ path_id: "H3.p2", axe: "H" }),
    syntheticEvidence({ path_id: "H4.p2", axe: "H" }),
    syntheticEvidence({ path_id: "I2.p1", axe: "I" }),
    syntheticEvidence({ path_id: "I3.p1", axe: "I" }),
    syntheticEvidence({ path_id: "P2.p1", axe: "P" }),
    syntheticEvidence({ path_id: "P3.p1", axe: "P" }),
  ];
}

function checkOwnershipScenarios(referentiel: Referentiel): void {
  // Scénario 1 : rang officiel Copper, Ownership prouvé Red (O1 seul) -> Green, avec mention.
  const redOwnershipResult = judge({
    referentiel,
    evidence: [...copperEvidence(), syntheticEvidence({ path_id: "O1.p1", axe: "O" })],
    hasAiUsageProof: true,
    referenceSourcesPresentes: new Set<SourceId>(["GA"]),
  });
  if (redOwnershipResult.rang_ponctuel === "copper" && redOwnershipResult.rang_affiche === "green" && redOwnershipResult.ownership.mention !== undefined) {
    pass('scénario Ownership : rang officiel Copper + Ownership prouvé Red -> rang_affiche "green" avec mention.');
  } else {
    fail(
      `scénario Ownership (Copper officiel, Ownership Red) : rang_ponctuel="${String(redOwnershipResult.rang_ponctuel)}", rang_affiche="${String(redOwnershipResult.rang_affiche)}", mention=${JSON.stringify(redOwnershipResult.ownership.mention)} — attendu ponctuel "copper", affiché "green", mention définie.`,
    );
  }

  // Scénario 2 : même rang officiel Copper, Ownership INCONNU (aucune source de référence Ownership présente) -> aucun rabais.
  const unknownOwnershipResult = judge({
    referentiel,
    evidence: copperEvidence(),
    hasAiUsageProof: true,
    // referenceSourcesPresentes omis : GA/RC non marquées présentes pour Ownership -> O1 non seedée -> Ownership inconnu.
  });
  if (unknownOwnershipResult.rang_ponctuel === "copper" && unknownOwnershipResult.rang_affiche === "copper" && !unknownOwnershipResult.ownership.rabais_applique) {
    pass("scénario Ownership : Ownership inconnu -> aucun rabais, rang_affiche = rang_ponctuel.");
  } else {
    fail(
      `scénario Ownership (Ownership inconnu) : rang_affiche="${String(unknownOwnershipResult.rang_affiche)}", rabais_applique=${unknownOwnershipResult.ownership.rabais_applique} — attendu rang_affiche "copper", aucun rabais.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 7. Badge qualité : jamais dans un calcul de rang/niveau/fourchette — garde
//    statique redondante avec `test/lib/quality-badge.test.ts` (déjà vert,
//    Phase 3), reliée ici pour que `npm run eval` seul la couvre aussi.
// ---------------------------------------------------------------------------

function checkQualityBadgeNeverInRanking(): void {
  const forbiddenFiles = [
    join(REPO_ROOT, "src", "core", "judge.ts"),
    join(REPO_ROOT, "src", "core", "registry.ts"),
  ];
  let violation = false;
  for (const file of forbiddenFiles) {
    const content = readFileSync(file, "utf8");
    if (/quality-badge/.test(content)) {
      fail(`badge qualité : "${file}" référence quality-badge — ne doit jamais entrer dans un calcul de rang.`);
      violation = true;
    }
  }
  // Aucun fichier de src/checks/** n'importe quality-badge (une mention en docstring dans
  // O2.sonar.ts reste légitime — seules les lignes `import` sont scannées).
  const checksDirAbs = join(REPO_ROOT, "src", "checks");
  for (const file of listTsFilesForBadgeScan(checksDirAbs)) {
    const content = readFileSync(file, "utf8");
    for (const line of content.split("\n")) {
      if (/^\s*import[^/]*quality-badge/.test(line)) {
        fail(`badge qualité : "${file}" importe quality-badge dans un check — interdit.`);
        violation = true;
      }
    }
  }
  if (!violation) {
    pass("badge qualité : jamais importé par core/judge.ts, core/registry.ts, ni aucun check (cf. test/lib/quality-badge.test.ts).");
  }
}

function listTsFilesForBadgeScan(dirAbs: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    const entryAbs = join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFilesForBadgeScan(entryAbs));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(entryAbs);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 8. Validation contre le binaire construit réellement + déterminisme — deux
//    sous-processus `node dist/cli.js`, écrivant chacun dans son propre
//    répertoire temporaire (jamais `recognaize-cli-out/`).
// ---------------------------------------------------------------------------

interface CliResultDoc {
  readonly rang_affiche: Rang | null;
  readonly [key: string]: unknown;
}

function stripVolatileFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatileFields);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/date|time|timestamp/i.test(key)) continue;
      out[key] = stripVolatileFields(entry);
    }
    return out;
  }
  return value;
}

function readSingleResultJson(outDir: string): CliResultDoc {
  const subjectDirs = readdirSync(outDir);
  if (subjectDirs.length !== 1) {
    throw new Error(`Répertoire de sortie inattendu (${outDir}) : ${subjectDirs.length} sous-dossier(s).`);
  }
  const resultPath = join(outDir, subjectDirs[0] ?? "", "result.json");
  return JSON.parse(readFileSync(resultPath, "utf8")) as CliResultDoc;
}

function runBuiltCliValidation(): void {
  const cliPath = join(REPO_ROOT, "dist", "cli.js");
  if (!existsSync(cliPath)) {
    fail(`binaire construit introuvable : "${cliPath}" — lancer \`npm run build\` avant \`npm run eval\`.`);
    return;
  }

  const scratchDirs: string[] = [];
  try {
    for (const profile of PROFILE_NAMES) {
      const wanted = expected.profiles[profile]?.rang_affiche;
      if (wanted === undefined) continue;
      const outDir = mkdtempSync(join(tmpdir(), `recognaize-eval-${profile}-`));
      scratchDirs.push(outDir);
      execFileSync(process.execPath, [cliPath, "analyze", profileDir(profile), "--out", outDir], {
        encoding: "utf8",
      });
      const doc = readSingleResultJson(outDir);
      if (doc.rang_affiche === wanted) {
        pass(`binaire construit (dist/cli.js) : ${profile} -> rang_affiche = "${wanted}" — exact.`);
      } else {
        fail(`binaire construit (dist/cli.js) : ${profile} -> rang_affiche = "${String(doc.rang_affiche)}", attendu "${wanted}".`);
      }
    }

    // Déterminisme : deux exécutions consécutives du même profil donnent des result.json
    // identiques hors horodatage — couverture complète (clone frais + npm ci + npm run build)
    // déjà dans test/e2e-jury.test.ts ("deux exécutions consécutives...") ; ce contrôle-ci est
    // la version rapide (même dist/cli.js déjà construit, pas de nouveau clone) référencée ici
    // pour que `npm run eval` seul en dépende aussi.
    const bohortDir = profileDir("bohort");
    const outDirFirst = mkdtempSync(join(tmpdir(), "recognaize-eval-determinism-1-"));
    const outDirSecond = mkdtempSync(join(tmpdir(), "recognaize-eval-determinism-2-"));
    scratchDirs.push(outDirFirst, outDirSecond);
    execFileSync(process.execPath, [cliPath, "analyze", bohortDir, "--out", outDirFirst], { encoding: "utf8" });
    execFileSync(process.execPath, [cliPath, "analyze", bohortDir, "--out", outDirSecond], { encoding: "utf8" });
    const first = stripVolatileFields(readSingleResultJson(outDirFirst));
    const second = stripVolatileFields(readSingleResultJson(outDirSecond));
    if (JSON.stringify(first) === JSON.stringify(second)) {
      pass("déterminisme (dist/cli.js, rapide) : deux exécutions consécutives de bohort donnent des result.json identiques hors horodatage.");
    } else {
      fail("déterminisme (dist/cli.js, rapide) : deux exécutions consécutives de bohort diffèrent hors horodatage.");
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    fail(`binaire construit : erreur d'exécution — ${detail}`);
  } finally {
    for (const dir of scratchDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Eval d'ablation : retirer une pièce porteuse ne fait jamais monter le
//    rang ponctuel ni la confiance, sur aucun étalon — ou le statut bascule
//    "indeterminate" quand la dernière source d'usage IA disparaît. Logique
//    dans `evals/ablation.ts` (réutilisée telle quelle par
//    `test/eval/ablation.test.ts`, même convention que l'anti-littéral) ;
//    ce bloc-ci ne fait que traduire ses `CheckResult[]` en pass()/fail().
// ---------------------------------------------------------------------------

function runAblationGuard(): void {
  const results = runAblationChecks(expected);
  for (const result of results) {
    if (result.ok) {
      pass(result.message);
    } else {
      fail(result.message);
    }
  }
}

// ---------------------------------------------------------------------------
// 10. Eval de hold-out : les 3 mutants jamais utilisés pour régler un seuil
//     (`fixtures/holdout/`, committés avant tout réglage de
//     `src/referentiel.json`) tombent dans leur fourchette calculée par le
//     pipeline ACTUEL — plus la garde d'antériorité (`git log`) qui échoue
//     si `evals/holdout.json` a été retouché après un réglage de seuil.
//     Logique dans `evals/holdout.ts` (réutilisée telle quelle par
//     `test/eval/holdout.test.ts`, même convention que l'ablation) ; ce
//     bloc-ci ne fait que traduire ses `CheckResult[]` en pass()/fail().
// ---------------------------------------------------------------------------

function runHoldoutGuard(): void {
  const results = [runAntecedenceGuard(), ...runHoldoutChecks(holdout)];
  for (const result of results) {
    if (result.ok) {
      pass(result.message);
    } else {
      fail(result.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function main(): void {
  process.stdout.write("[eval] recognAIze — matrice 4 axes.\n\n");

  runAntiLiteralGuard();

  const runs = runMainMatrix();
  runOrphanPathIdGuard(runs[0]?.registryWarnings ?? []);

  checkExpectedRanks(runs);
  checkNegativeFixtures(runs);
  checkAntiRichesse(runs);
  checkNoComprisEtat(runs);
  checkThresholdCitations(runs);

  const { referentiel } = loadReferentiel();
  checkOwnershipScenarios(referentiel);
  checkQualityBadgeNeverInRanking();

  runBuiltCliValidation();
  runAblationGuard();
  runHoldoutGuard();

  process.stdout.write("\n");
  if (failures.length === 0) {
    process.stdout.write(`[eval] 4/4 rang exact, ${negative.negatives.length} fixtures négatives infirmées, anti-richesse verte, ablation verte, hold-out vert — TOUT VERT.\n`);
    process.exitCode = 0;
  } else {
    process.stderr.write(`[eval] ${failures.length} échec(s) :\n`);
    for (const failure of failures) {
      process.stderr.write(`  - ${failure}\n`);
    }
    process.exitCode = 1;
  }
}

main();
