/**
 * `evals/ablation.ts` — « Retirer une pièce ne fait jamais monter. » Pour
 * chacun des 4 étalons et chaque pièce PORTEUSE réellement présente dans ce
 * profil (`git-activity.json`, `pull-requests.json`, `repo-context/`,
 * `session.md` — jamais une pièce que le profil n'a pas : perceval n'a par
 * exemple ni PR, ni RC, ni session), construit une copie amputée dans un
 * répertoire temporaire (jamais `recognaize-cli-out/`), ré-exécute
 * `src/analyze.ts` EN PROCESSUS (même convention que `evals/run.ts`, pas de
 * sous-processus pour ce module), et vérifie que le résultat ne remonte
 * jamais — sauf le cas « plus aucune preuve d'usage IA », où le statut doit
 * basculer `"indeterminate"`.
 *
 * Convention (`evals/anti-literal.ts`) : ce module expose des fonctions PURES
 * réutilisables (aucun `pass()`/`fail()` ici), consommées à la fois par
 * `evals/run.ts` (rapport texte pass/fail, gate de `npm run eval`) et
 * `test/eval/ablation.test.ts` (assertions vitest, visibilité CI dans
 * `npm test`) — aucune des deux ne duplique le calcul.
 *
 * `src/lib/ai-usage-proof.ts` ne lit JAMAIS `ctx.pullRequests` : ses 4 seuls
 * signaux sont `gitActivity.commits.ai_coauthored_ratio`,
 * `gitActivity.assistant_usage.sessions_per_week` (tous deux portés par
 * `git-activity.json`), `repoContext.artifacts` (`repo-context/`) et
 * `session.turnCount` (`session.md`) — retirer `pull-requests.json` ne peut
 * donc JAMAIS, à lui seul, vider la preuve d'usage IA. {@link signalContributingPieces}
 * réimplémente ces 4 conditions, regroupées par pièce plutôt que par
 * fonction, comme oracle INDÉPENDANT de « quelle pièce, retirée seule,
 * viderait la preuve d'usage IA » — calculé AVANT d'exécuter l'ablation
 * réelle, puis comparé au `judgeResult.status` réellement observé. Réutiliser
 * `hasAiUsageProof()` directement sur le contexte amputé rendrait le test
 * tautologique (le juge appelle déjà cette fonction) ; cette copie vérifie
 * au contraire que le VRAI pipeline (chargement de fichier amputé, contexte,
 * juge) se comporte comme le prédit une lecture indépendante du code.
 */

import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runAnalysis, type AnalysisOutcome } from "../src/analyze.js";
import type { Fourchette, ProfileContext, Rang } from "../src/core/types.js";
import { RANGS_ORDONNES } from "../src/core/types.js";
import { buildReportHtml, type ReportExtras } from "../src/report/html.js";
import { buildResultDocument } from "../src/report/json.js";
import { GIT_ACTIVITY_FILE } from "../src/sources/git-activity.js";
import { PULL_REQUESTS_FILE } from "../src/sources/pull-requests.js";
import { REPO_CONTEXT_DIR } from "../src/sources/repo-context.js";
import { SESSION_FILE } from "../src/sources/session.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

export function profileDir(name: string): string {
  return join(REPO_ROOT, "fixtures", "profiles", name);
}

// ---------------------------------------------------------------------------
// Pièces porteuses (tâche 1)
// ---------------------------------------------------------------------------

export const CARRYING_PIECES = [GIT_ACTIVITY_FILE, PULL_REQUESTS_FILE, REPO_CONTEXT_DIR, SESSION_FILE] as const;
export type CarryingPiece = (typeof CARRYING_PIECES)[number];

function pieceSlug(piece: CarryingPiece): string {
  return piece.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
}

/** Réimplémentation indépendante de `src/lib/ai-usage-proof.ts` — voir l'explication en tête de fichier. */
function signalContributingPieces(ctx: ProfileContext): ReadonlySet<CarryingPiece> {
  const pieces = new Set<CarryingPiece>();
  const ratio = ctx.gitActivity?.commits?.ai_coauthored_ratio;
  const sessionsPerWeek = ctx.gitActivity?.assistant_usage?.sessions_per_week;
  if ((typeof ratio === "number" && ratio > 0) || (typeof sessionsPerWeek === "number" && sessionsPerWeek > 0)) {
    pieces.add(GIT_ACTIVITY_FILE);
  }
  const artifacts = ctx.repoContext?.artifacts;
  if (Array.isArray(artifacts) && artifacts.length > 0) {
    pieces.add(REPO_CONTEXT_DIR);
  }
  const turnCount = ctx.session?.turnCount;
  if (typeof turnCount === "number" && turnCount > 0) {
    pieces.add(SESSION_FILE);
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Index de rang — `null` (aucun rang connu) toujours traité comme le plus bas.
// ---------------------------------------------------------------------------

const RANK_INDEX = new Map(RANGS_ORDONNES.map((rang, index) => [rang, index]));

function rangIndex(rang: Rang | null): number {
  if (rang === null) return -1;
  return RANK_INDEX.get(rang) ?? -1;
}

// ---------------------------------------------------------------------------
// Ablation réelle : copie amputée dans un répertoire temporaire (jamais
// `recognaize-cli-out/`), ré-exécution EN PROCESSUS de `src/analyze.ts`.
// ---------------------------------------------------------------------------

interface AblatedRun {
  readonly outcome: AnalysisOutcome;
  readonly cleanup: () => void;
}

function runAblatedAnalysis(profile: string, piece: CarryingPiece): AblatedRun {
  const tmpDir = mkdtempSync(join(tmpdir(), `recognaize-ablation-${profile}-${pieceSlug(piece)}-`));
  cpSync(profileDir(profile), tmpDir, { recursive: true });
  rmSync(join(tmpDir, piece), { recursive: true, force: true });
  const outcome = runAnalysis(tmpDir, `${profile}-ablate-${pieceSlug(piece)}`, { includeExperimentalLlm: false });
  return { outcome, cleanup: () => rmSync(tmpDir, { recursive: true, force: true }) };
}

/** Titre RÉELLEMENT rendu par `report.html` (`<h1>`) — jamais la fourchette JSON brute pour l'assertion de libellé (tâche 4). */
function renderedTitle(outcome: AnalysisOutcome, profileId: string): string {
  const document = buildResultDocument(outcome, profileId);
  const extras: ReportExtras = {
    declaratif: outcome.ctx.declaratif,
    gitActivity: outcome.ctx.gitActivity,
    sonarMeasures: outcome.ctx.sonarMeasures,
  };
  const html = buildReportHtml(document, outcome.referentiel, extras);
  const match = /<h1>([^]*?)<\/h1>/.exec(html);
  if (match?.[1] === undefined) {
    throw new Error(`report.html : aucun <h1> trouvé pour "${profileId}" — rendu cassé.`);
  }
  return match[1];
}

// ---------------------------------------------------------------------------
// Résultat de vérification — pur, aucun `console.*` ici (voir la convention
// en tête de fichier).
// ---------------------------------------------------------------------------

export interface CheckResult {
  /** Clé machine stable `<profil>:<pièce>:<sorte de vérification>` — jamais le texte du message (qui embarque des valeurs numériques susceptibles de dériver légèrement). Permet à un consommateur (ex. `test/eval/ablation.test.ts`) de router un cas connu-cassé sans dépendre du texte. */
  readonly id: string;
  readonly ok: boolean;
  readonly message: string;
}

export interface ExpectedFile {
  readonly profiles: Record<string, { readonly rang_affiche: Rang }>;
}

/**
 * Les 3 cas documentés — vérifiés EXACTEMENT, pas seulement bornés.
 *
 * `leodagan` n'a pas de `session.md` : sans `git-activity.json`, l'axe T ne
 * reçoit plus AUCUNE `Evidence` chez `leodagan` (RC/PR n'apportent qu'un
 * indice ou rien pour cette marche), contrairement à `arthur` qui a une
 * session et donc un signal `S` (faible mais réel) à cette marche.
 * `niveau_ponctuel` retombe donc à T1 (rouge) au lieu de rester à un niveau
 * intermédiaire — un comportement cohérent avec le fonctionnement du juge
 * (« jamais d'extrapolation » sur une marche totalement inconnue), pas un bug
 * de calcul.
 */
const DOCUMENTED_FOURCHETTES: Readonly<Record<string, Fourchette>> = {
  [`perceval:${GIT_ACTIVITY_FILE}`]: { bas: "white", haut: "gold" }, // indeterminate
  [`leodagan:${GIT_ACTIVITY_FILE}`]: { bas: "red", haut: "green" },
  [`arthur:${GIT_ACTIVITY_FILE}`]: { bas: "red", haut: "copper" },
};

/**
 * `true` dès qu'AU MOINS un signal mesurable diffère entre `baseline` et
 * `ablated` — voir l'explication dans {@link evaluateAblationCase}. Compare,
 * dans cet ordre (le premier écart
 * suffit, pas besoin de tout parcourir) : le nombre d'`Evidence` produites,
 * le statut, le rang affiché, la confiance globale, puis (couverture, accord,
 * confiance, niveau_ponctuel, niveau_prouve) de chacun des 4 axes officiels.
 * `false` seulement si RIEN de tout cela n'a bougé — la pièce retirée n'a
 * alors eu strictement aucun effet observable, signe qu'aucun check ne la
 * consomme pour ce profil.
 */
function ablationHasMeasurableEffect(baseline: AnalysisOutcome, ablated: AnalysisOutcome): boolean {
  if (baseline.evidence.length !== ablated.evidence.length) return true;
  if (baseline.judgeResult.status !== ablated.judgeResult.status) return true;
  if (baseline.judgeResult.rang_affiche !== ablated.judgeResult.rang_affiche) return true;
  if (baseline.judgeResult.confiance_globale !== ablated.judgeResult.confiance_globale) return true;

  for (let i = 0; i < baseline.judgeResult.axes.length; i += 1) {
    const before = baseline.judgeResult.axes[i];
    const after = ablated.judgeResult.axes[i];
    if (before === undefined || after === undefined) return true; // liste d'axes différente -> effet, pas un no-op.
    if (
      before.couverture !== after.couverture ||
      before.accord !== after.accord ||
      before.confiance !== after.confiance ||
      before.niveau_ponctuel !== after.niveau_ponctuel ||
      before.niveau_prouve !== after.niveau_prouve
    ) {
      return true;
    }
  }
  return false;
}

function evaluateAblationCase(options: {
  readonly profile: string;
  readonly piece: CarryingPiece;
  readonly wanted: Rang;
  readonly baseline: AnalysisOutcome;
  readonly ablated: AnalysisOutcome;
  readonly expectIndeterminate: boolean;
}): CheckResult[] {
  const { profile, piece, wanted, baseline, ablated, expectIndeterminate } = options;
  const label = `${profile} − ${piece}`;
  const idPrefix = `${profile}:${piece}`;
  const results: CheckResult[] = [];

  const baselineRang = baseline.judgeResult.rang_affiche;
  const ablatedRang = ablated.judgeResult.rang_affiche;
  const baselineConf = baseline.judgeResult.confiance_globale;
  const ablatedConf = ablated.judgeResult.confiance_globale;

  // AC 1 : jamais de montée, ni en rang ni en confiance, sur AUCUNE ablation.
  results.push({
    id: `${idPrefix}:rank-monotonic`,
    ok: rangIndex(ablatedRang) <= rangIndex(baselineRang),
    message: `${label} : rang_affiche ne monte pas (${String(ablatedRang)} vs ligne de base ${String(baselineRang)}).`,
  });
  results.push({
    id: `${idPrefix}:confidence-monotonic`,
    ok: ablatedConf <= baselineConf,
    message: `${label} : confiance ne monte pas (${ablatedConf} vs ligne de base ${baselineConf}).`,
  });

  // Les deux checks ci-dessus n'assertent QUE la non-hausse (<=) — une pièce
  // dont le retrait ne change RIEN (rang_affiche ET confiance_globale
  // identiques) passe quand même, sans distinguer « source non porteuse pour
  // CE profil, sur CETTE métrique agrégée » (légitime : `confiance_globale`
  // est le MIN des 4 axes officiels, `core/judge.ts` — un axe déjà à
  // confiance 0 ailleurs plafonne le global quoi qu'il arrive à la pièce
  // retirée) de « source jamais consommée par aucun check » (bug réel : un
  // pack qui n'importe jamais cette pièce).
  //
  // Assertion ajoutée : au moins UN signal mesurable doit bouger quelque part
  // (nombre d'Evidence, ou couverture/accord/confiance/niveau d'au moins un
  // axe, ou le rang/la confiance/le statut eux-mêmes) — sinon la pièce n'a
  // structurellement aucun effet, ce qui est le signe d'un check qui ne la
  // consomme jamais. Échec dur de l'eval (pas un simple avertissement).
  results.push({
    id: `${idPrefix}:measurable-effect`,
    ok: ablationHasMeasurableEffect(baseline, ablated),
    message: `${label} : l'ablation a un effet mesurable (evidence[], couverture/accord/confiance/niveau d'au moins un axe, rang, confiance globale, ou statut) — sinon cette pièce ne serait consommée par aucun check pour ce profil.`,
  });

  // Dernière source restante -> indeterminate ; sinon -> rang <= attendu, attendu ∈ fourchette.
  if (expectIndeterminate) {
    results.push({
      id: `${idPrefix}:status-indeterminate`,
      ok: ablated.judgeResult.status === "indeterminate",
      message: `${label} : dernière source d'usage IA retirée -> status "indeterminate" attendu, observé "${ablated.judgeResult.status}".`,
    });
  } else {
    results.push({
      id: `${idPrefix}:status-ok`,
      ok: ablated.judgeResult.status === "ok",
      message: `${label} : source d'usage IA restante -> status "ok" attendu, observé "${ablated.judgeResult.status}".`,
    });
    results.push({
      id: `${idPrefix}:point-rank-le-wanted`,
      ok: rangIndex(ablatedRang) <= rangIndex(wanted),
      message: `${label} : rang ponctuel (${String(ablatedRang)}) <= rang attendu de l'étalon ("${wanted}").`,
    });
    const { bas, haut } = ablated.judgeResult.fourchette;
    results.push({
      id: `${idPrefix}:expected-in-fourchette`,
      ok: rangIndex(bas) <= rangIndex(wanted) && rangIndex(wanted) <= rangIndex(haut),
      message: `${label} : rang attendu ("${wanted}") ∈ fourchette [${bas} ; ${haut}].`,
    });
  }

  // Cas documentés exactement (tâche 3) + libellé affiché (tâche 4).
  const documented = DOCUMENTED_FOURCHETTES[`${profile}:${piece}`];
  if (documented !== undefined) {
    const { bas, haut } = ablated.judgeResult.fourchette;
    results.push({
      id: `${idPrefix}:documented-fourchette`,
      ok: bas === documented.bas && haut === documented.haut,
      message: `${label} : fourchette documentée [${documented.bas} ; ${documented.haut}] exacte, observé [${bas} ; ${haut}].`,
    });
  }

  const width = rangIndex(ablated.judgeResult.fourchette.haut) - rangIndex(ablated.judgeResult.fourchette.bas);
  if (width >= 3) {
    const title = renderedTitle(ablated, `${profile}-ablate-${pieceSlug(piece)}`);
    results.push({
      id: `${idPrefix}:title-width3`,
      ok: title === "Indéterminé",
      message: `${label} : largeur de fourchette ${width} >= 3 -> titre affiché "Indéterminé" attendu, observé "${title}".`,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Point d'entrée exporté : la matrice complète des ablations.
// ---------------------------------------------------------------------------

export function runAblationChecks(expected: ExpectedFile): readonly CheckResult[] {
  const results: CheckResult[] = [];
  const profiles = Object.keys(expected.profiles);

  for (const profile of profiles) {
    const wanted = expected.profiles[profile]?.rang_affiche;
    if (wanted === undefined) {
      results.push({
        id: `${profile}:expected-json-missing`,
        ok: false,
        message: `ablation : expected.json ne connaît pas le profil "${profile}".`,
      });
      continue;
    }

    const baseline = runAnalysis(profileDir(profile), profile, { includeExperimentalLlm: false });
    const contributing = signalContributingPieces(baseline.ctx);

    for (const piece of CARRYING_PIECES) {
      const piecePathAbs = join(profileDir(profile), piece);
      if (!existsSync(piecePathAbs)) continue; // pièce absente du profil -> rien à ablater (perceval n'a ni PR, ni RC, ni session).

      const { outcome: ablated, cleanup } = runAblatedAnalysis(profile, piece);
      try {
        const expectIndeterminate = contributing.size === 1 && contributing.has(piece);
        results.push(
          ...evaluateAblationCase({ profile, piece, wanted, baseline, ablated, expectIndeterminate }),
        );
      } finally {
        cleanup();
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Exécution directe (`tsx evals/ablation.ts`) — pour l'itération manuelle,
// hors `npm run eval` (branché depuis `evals/run.ts`).
// ---------------------------------------------------------------------------

function isDirectExecution(): boolean {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(HERE, "ablation.ts");
}

if (isDirectExecution()) {
  const { readFileSync } = await import("node:fs");
  const expected = JSON.parse(readFileSync(join(REPO_ROOT, "evals", "expected.json"), "utf8")) as ExpectedFile;
  const results = runAblationChecks(expected);
  let failures = 0;
  for (const result of results) {
    if (result.ok) {
      process.stdout.write(`[ablation] OK : ${result.message}\n`);
    } else {
      failures += 1;
      process.stderr.write(`[ablation] ÉCHEC : ${result.message}\n`);
    }
  }
  process.stdout.write(`\n[ablation] ${results.length - failures}/${results.length} vérifications passées.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}
