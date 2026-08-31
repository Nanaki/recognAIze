/**
 * `evals/holdout.ts` — « Des profils jamais utilisés pour régler un seuil. »
 * Exécute les 3 mutants du hold-out (`fixtures/holdout/`, committés AVANT
 * tout réglage de seuil dans `src/referentiel.json`) et vérifie que le rang
 * attendu — écrit dans `evals/holdout.json` au moment de la construction,
 * jamais retouché depuis — tombe dans la fourchette RÉELLEMENT calculée par
 * le pipeline ACTUEL.
 *
 * Même convention que `evals/ablation.ts` (`evals/anti-literal.ts`) : ce
 * module expose des fonctions PURES réutilisables (aucun `pass()`/`fail()`
 * ici), consommées à la fois par `evals/run.ts` (rapport texte, gate de
 * `npm run eval`) et `test/eval/holdout.test.ts` (assertions vitest,
 * visibilité CI dans `npm test`) — aucune des deux ne duplique le calcul.
 * `runAnalysis` est appelée EN PROCESSUS (même convention que
 * `evals/ablation.ts`), jamais via un sous-processus `dist/cli.js` pour ce
 * module.
 *
 * Ce module ajoute AUSSI une garde d'antériorité : une vérification RÉELLE
 * (`git log`, pas un commentaire) que `evals/holdout.json` n'a jamais été
 * modifié APRÈS qu'un commit ait touché `src/referentiel.json` — voir
 * {@link runAntecedenceGuard} pour le raisonnement complet sur la sémantique
 * exacte de cette garde (le hold-out doit rester une clé de réponse écrite
 * une fois pour toutes, jamais retouchée a posteriori — le réglage de seuils
 * APRÈS le hold-out, lui, reste attendu et légitime tant qu'il ne s'appuie
 * QUE sur les 4 étalons réels, jamais sur le hold-out).
 */

import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runAnalysis, type AnalysisOutcome } from "../src/analyze.js";
import type { Fourchette, Rang } from "../src/core/types.js";
import { RANGS_ORDONNES } from "../src/core/types.js";
import type { CheckResult } from "./ablation.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

export function holdoutDir(name: string): string {
  return join(REPO_ROOT, "fixtures", "holdout", name);
}

// ---------------------------------------------------------------------------
// Schéma d'`evals/holdout.json` — seuls les champs consommés ici sont typés.
// ---------------------------------------------------------------------------

export interface HoldoutMutant {
  readonly rang_attendu: string;
  readonly fourchette_attendue: Fourchette;
}

export interface HoldoutFile {
  readonly mutants: Record<string, HoldoutMutant>;
}

const RANK_INDEX = new Map(RANGS_ORDONNES.map((rang, index) => [rang, index]));

function rangIndex(rang: Rang | null): number {
  if (rang === null) return -1;
  return RANK_INDEX.get(rang) ?? -1;
}

function isRang(value: string): value is Rang {
  return RANK_INDEX.has(value as Rang);
}

// ---------------------------------------------------------------------------
// Exécution réelle des 3 mutants (tâche 2) — jamais de sous-processus, jamais
// d'écriture dans `recognaize-cli-out/` (ces fixtures sont déjà des répertoires
// statiques, pas d'ablation en copie temporaire ici, contrairement à
// `evals/ablation.ts`).
// ---------------------------------------------------------------------------

function runMutant(name: string): AnalysisOutcome {
  return runAnalysis(holdoutDir(name), name, { includeExperimentalLlm: false });
}

/**
 * Vérifie qu'un mutant tombe dans sa fourchette attendue.
 *
 * `rang_attendu` vaut `"red_ou_green_selon_correctif_T2"` pour le mutant
 * `arthur-plus-pr` — pas une valeur de `Rang` valide, un jugement DISJONCTIF
 * assumé au moment de la construction du hold-out : « red » si le défaut
 * suspecté dans `T2.pull-requests.ts` reste, « green » si un correctif
 * générique — réglé sur `leodagan`/`arthur` réels, jamais sur ce mutant —
 * s'y généralise. Ce n'est PAS une fourchette continue à trois rangs
 * plausibles (aucun raisonnement n'envisage « blue », qui se trouve pourtant
 * entre les deux dans `RANGS_ORDONNES`) : c'est un choix binaire entre deux
 * candidats explicites. Vérifié ici par appartenance à l'ENSEMBLE `{bas, haut}`
 * de `fourchette_attendue` — plus strict que « rang_attendu ∈ [bas;haut] »
 * (qui accepterait à tort "blue"), et fidèle au nom du champ. Les deux autres
 * mutants ont un `rang_attendu` qui EST un `Rang` valide (fourchette à un
 * seul point dans `evals/holdout.json`) : pour eux, cette fonction retombe
 * sur la vérification usuelle d'appartenance à un intervalle.
 */
function evaluateHoldoutCase(name: string, mutant: HoldoutMutant, outcome: AnalysisOutcome): CheckResult[] {
  const results: CheckResult[] = [];
  const { bas, haut } = outcome.judgeResult.fourchette;
  const affiche = outcome.judgeResult.rang_affiche;

  if (isRang(mutant.rang_attendu)) {
    const wanted = mutant.rang_attendu;
    results.push({
      id: `${name}:expected-in-computed-fourchette`,
      ok: rangIndex(bas) <= rangIndex(wanted) && rangIndex(wanted) <= rangIndex(haut),
      message: `${name} : rang attendu ("${wanted}") ∈ fourchette calculée [${bas} ; ${haut}] (rang_affiche observé : "${String(affiche)}").`,
    });
  } else {
    // Jugement disjonctif (voir l'explication ci-dessus) : le rang affiché calculé doit
    // être exactement l'un des deux candidats bornant `fourchette_attendue`.
    const candidates = new Set<Rang>([mutant.fourchette_attendue.bas, mutant.fourchette_attendue.haut]);
    results.push({
      id: `${name}:expected-in-computed-fourchette`,
      ok: affiche !== null && candidates.has(affiche),
      message: `${name} : rang attendu disjonctif "${mutant.rang_attendu}" (candidats {${[...candidates].join(", ")}}) — rang_affiche observé "${String(affiche)}" ∈ candidats : ${affiche !== null && candidates.has(affiche)} (fourchette calculée [${bas} ; ${haut}]).`,
    });
  }

  return results;
}

export function runHoldoutChecks(holdout: HoldoutFile): readonly CheckResult[] {
  const results: CheckResult[] = [];
  for (const [name, mutant] of Object.entries(holdout.mutants)) {
    const outcome = runMutant(name);
    results.push(...evaluateHoldoutCase(name, mutant, outcome));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Garde d'antériorité (tâche 3) — vérification RÉELLE via `git log`, pas un
// commentaire. Voir le raisonnement complet ci-dessous.
//
// Sémantique exacte retenue (documentée ici parce qu'aucune formulation
// « précède TOUT commit touchant referentiel.json » n'est satisfiable à la
// lettre : `src/referentiel.json` existe et contient déjà des seuils réels
// AVANT que `evals/holdout.json` ne puisse même être construit — un mutant ne
// peut pas être jugé contre un référentiel qui n'existe pas encore. Vérifié
// ici : le commit `feat(referentiel): add 5-axis 24-rung grid as source of
// truth` précède bien le commit du hold-out, et un commit ultérieur,
// `fix(referentiel): resolve orphan path_ids and tune thresholds for 4/4
// exact baseline`, retouche RÉELLEMENT des valeurs de seuil APRÈS le hold-out
// — attendu et documenté par le hold-out lui-même : `evals/holdout.json`
// prédit par construction (`arthur-plus-pr`) qu'un correctif ultérieur,
// réglé sur les étalons réels, pourrait changer son comportement.) :
//
// Le risque RÉEL que cette garde doit intercepter n'est PAS « referentiel.json
// a été retouché après le hold-out » (attendu, légitime, tant que le réglage
// ne s'appuie QUE sur les 4 étalons réels — c'est la tâche 2 ci-dessus qui
// vérifie que la prédiction pré-enregistrée tient malgré ce réglage). Le
// risque réel est la falsification a posteriori de la clé de réponse : que
// `evals/holdout.json` LUI-MÊME soit réécrit après avoir vu le comportement
// d'un référentiel déjà réglé, pour faire mine que la prédiction était juste.
// Cette garde vérifie donc : `evals/holdout.json` n'a jamais reçu de second
// commit (une réécriture) POSTÉRIEUR à un commit touchant
// `src/referentiel.json` qui soit lui-même postérieur à la création du
// hold-out. Concrètement, avec l'historique actuel (un seul commit sur
// `evals/holdout.json`), la garde est verte tant que ce commit unique n'est
// jamais suivi d'un second commit sur ce même fichier.
// ---------------------------------------------------------------------------

export interface CommitInfo {
  readonly hash: string;
  readonly isoDate: string;
}

function gitLogForPath(pathRelToRoot: string): readonly CommitInfo[] {
  let raw: string;
  try {
    raw = execFileSync("git", ["log", "--format=%H|%aI", "--", pathRelToRoot], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`garde d'antériorité : \`git log\` a échoué pour "${pathRelToRoot}" — ${detail}`);
  }
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  // `git log` liste du plus récent au plus ancien -> on inverse pour un ordre chronologique croissant.
  return lines
    .map((line) => {
      const [hash, isoDate] = line.split("|");
      if (hash === undefined || isoDate === undefined) {
        throw new Error(`garde d'antériorité : ligne \`git log\` inattendue pour "${pathRelToRoot}" : "${line}".`);
      }
      return { hash, isoDate };
    })
    .reverse();
}

export function runAntecedenceGuard(): CheckResult {
  const HOLDOUT_PATH = "evals/holdout.json";
  const REFERENTIEL_PATH = "src/referentiel.json";

  const holdoutCommits = gitLogForPath(HOLDOUT_PATH);
  const referentielCommits = gitLogForPath(REFERENTIEL_PATH);

  if (holdoutCommits.length === 0) {
    return {
      id: "holdout:antecedence-guard",
      ok: false,
      message: `garde d'antériorité : "${HOLDOUT_PATH}" n'a aucun commit dans l'historique git — introuvable ou jamais committé.`,
    };
  }

  const firstHoldoutCommit = holdoutCommits[0]!;

  // Commits sur referentiel.json postérieurs à la CRÉATION du hold-out (réglage
  // attendu et légitime, cf. commentaire ci-dessus — n'invalide PAS la garde à
  // lui seul).
  const referentielCommitsAfterHoldout = referentielCommits.filter(
    (c) => c.isoDate > firstHoldoutCommit.isoDate,
  );

  if (referentielCommitsAfterHoldout.length === 0) {
    return {
      id: "holdout:antecedence-guard",
      ok: true,
      message: `garde d'antériorité : "${HOLDOUT_PATH}" (commit ${firstHoldoutCommit.hash.slice(0, 12)}, ${firstHoldoutCommit.isoDate}) précède TOUS les commits touchant "${REFERENTIEL_PATH}" — aucun réglage de seuil constaté depuis.`,
    };
  }

  // Réglage(s) postérieur(s) constaté(s) — légitime tant que evals/holdout.json
  // n'a JAMAIS été retouché (réécrit) après l'un d'eux.
  const holdoutRewritesAfterTuning = holdoutCommits.filter((h) =>
    referentielCommitsAfterHoldout.some((r) => r.isoDate < h.isoDate),
  );

  if (holdoutRewritesAfterTuning.length > 0) {
    const offenders = holdoutRewritesAfterTuning.map((h) => `${h.hash.slice(0, 12)} (${h.isoDate})`).join(", ");
    return {
      id: "holdout:antecedence-guard",
      ok: false,
      message: `garde d'antériorité : "${HOLDOUT_PATH}" a été RÉÉCRIT après un commit ayant touché "${REFERENTIEL_PATH}" — commit(s) suspect(s) : ${offenders}. La clé de réponse du hold-out ne doit jamais être retouchée après un réglage de seuil.`,
    };
  }

  const tuningOffenders = referentielCommitsAfterHoldout
    .map((r) => `${r.hash.slice(0, 12)} (${r.isoDate})`)
    .join(", ");
  return {
    id: "holdout:antecedence-guard",
    ok: true,
    message: `garde d'antériorité : "${HOLDOUT_PATH}" (commit unique ${firstHoldoutCommit.hash.slice(0, 12)}, ${firstHoldoutCommit.isoDate}) n'a jamais été retouché depuis — réglage(s) de seuil constaté(s) ensuite sur "${REFERENTIEL_PATH}" (${tuningOffenders}), légitime tant que la clé de réponse elle-même reste intacte (vérifié par cette garde).`,
  };
}

// ---------------------------------------------------------------------------
// Exécution directe (`tsx evals/holdout.ts`) — pour l'itération manuelle, hors
// `npm run eval` (branché depuis `evals/run.ts`).
// ---------------------------------------------------------------------------

function isDirectExecution(): boolean {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(HERE, "holdout.ts");
}

if (isDirectExecution()) {
  const { readFileSync } = await import("node:fs");
  const holdout = JSON.parse(readFileSync(join(REPO_ROOT, "evals", "holdout.json"), "utf8")) as HoldoutFile;
  const results = [runAntecedenceGuard(), ...runHoldoutChecks(holdout)];
  let failures = 0;
  for (const result of results) {
    if (result.ok) {
      process.stdout.write(`[holdout] OK : ${result.message}\n`);
    } else {
      failures += 1;
      process.stderr.write(`[holdout] ÉCHEC : ${result.message}\n`);
    }
  }
  process.stdout.write(`\n[holdout] ${results.length - failures}/${results.length} vérifications passées.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}
