/**
 * Signaux `RC.*` partagés. Consommés par `src/checks/core-repo-context/
 * {H2,H3,H4,H5,H6,H7,O3,O4,O5}.repo-context.ts`. Centralise ici, plutôt que dans
 * chaque check, le filtrage par catégorie de `RepoContextArtifact[]`
 * (`sources/repo-context.ts`) — même schéma que `lib/context-files-signal.ts`
 * pour `GA.context_files`.
 *
 * Convention tri-state uniforme à TOUTE fonction de ce module : `ctx.repoContext`
 * absent (`RC` jamais fourni) ⇒ `undefined` (jamais regardé, jamais une
 * contre-preuve implicite) ; présent (même `artifacts: []`) ⇒ valeur réelle
 * (looked, éventuellement 0/false) — exactement la sémantique « RC fourni sans … »
 * documentée par `referentiel.json` pour H2-H7/O3-O5 : combinée à la négation
 * complète par défaut d'`evaluateProofPathDefault` (`lib/threshold-eval.ts`), un
 * check n'a donc besoin d'AUCUNE règle de contre-preuve étroite ici — contrairement
 * à `H2`-`H5.git-activity.ts`, dont la règle partagée `context_files tout à zéro`
 * existe pour éviter la contamination croisée entre marches partageant un même
 * compteur GA. Chaque signal RC ci-dessous est self-contained à sa propre marche :
 * sa négation complète EST déjà la contre-preuve documentée par le référentiel
 * pour ce chemin de preuve précis (vérifié marche par marche dans la docstring
 * de chaque check).
 *
 * « capitalisation » est exclue de tout signal de l'axe H : ces dossiers ne
 * comptent jamais pour H. `sources/repo-context.ts` range `aidd_docs/tasks`,
 * `docs/decisions`, `docs/adr`, `docs/specs`, `docs/plans` dans leur propre
 * catégorie `"capitalisation"`, distincte de `"regle"`/`"skill"`/`"agent"`/
 * `"hook"`/`"deny-list"`/`"prompt"` — aucune re-classification n'est nécessaire
 * ici, seulement une exclusion explicite dans les catégories consultées par
 * `behaviorArtifactsSpecificCount`, `guardrailArtifactPresent`,
 * `loopArtifactExecutable`, `multiAgentOrchestratorCount`, et par
 * `evalsOrTrustTierSignal` en mode `excludeCapitalisation: true` (utilisé par
 * `H7`, marche de l'axe H). `O3`/`O5` (axe Ownership, hors ligne de montée H)
 * restent seuls à consulter `"capitalisation"`.
 *
 * Pas de catégorie `"commande"` dédiée : les 9 catégories de
 * `repo-context.ts` n'en comptent aucune nommée « commande » — seule
 * `"prompt"` (`.github/prompts/`) s'en rapproche structurellement (un prompt
 * slash-command-like). `behaviorArtifactsSpecificCount` inclut donc `"prompt"`
 * aux côtés de `"regle"`/`"skill"`/`"agent"`, faute de mieux, plutôt que
 * d'exiger une modification du classement de `repo-context.ts`.
 *
 * `H6` (« boucle exécutable ») est distingué de `H5` (« guardrail ») par la
 * spécificité, pas par une catégorie dédiée : `repo-context.ts` n'a pas de
 * catégorie « CI workflow »/« script de boucle » séparée — `"hook"` est la
 * seule catégorie structurellement executable (scripts/config invoqués par
 * l'outillage, `.claude/hooks/`, `.github/hooks/`), partagée par construction
 * avec le guardrail de `H5`. Pour donner un sens à la règle « un document
 * décrivant une boucle jamais faite doit être infirmé — un document ne prouve
 * jamais une capacité d'exécution », `H6` exige EN PLUS que l'artefact hook
 * soit `specific` (≥2 indices/4 du détecteur de `repo-context.ts`) — une
 * simple présence suffit pour `H5` (garde-fou minimal), une présence spécifique
 * est requise pour `H6` (preuve d'une boucle réellement outillée, pas un fichier
 * placeholder). Un fichier de prose sous un dossier non reconnu par
 * `repo-context.ts` (ex. `docs/brainstorm/`, absent de `KNOWN_NESTED_DIRS`)
 * n'apparaît de toute façon JAMAIS comme artefact `"hook"` — il n'est même pas
 * inventorié — donc ne peut structurellement jamais prouver `H6`.
 *
 * `evals`/`trust tier` sont détectés par motif de nom de fichier, pas par
 * catégorie : aucune des 9 catégories ne couvre « evals » ou « trust
 * tier/circuit breaker ». Seule détection possible sans accès au contenu brut
 * (`RepoContextArtifact` n'expose pas `content`) : `relPath` contenant `eval`
 * (resp. `trust-tier`/`trust_tier`/`circuit-breaker`/`circuit_breaker`),
 * insensible à la casse — même schéma heuristique que
 * `P2.git-activity.ts`.`ISOLATION_ARTIFACT_PATTERN`.
 */

import type { ArtifactCategory, RepoContextData } from "../sources/repo-context.js";

export type TriBoolean = boolean | undefined;
export type TriCount = number | undefined;

function artifactsOrUndefined(rc: RepoContextData | undefined) {
  return rc === undefined ? undefined : rc.artifacts;
}

function countByCategories(
  rc: RepoContextData | undefined,
  categories: readonly ArtifactCategory[],
  specificOnly: boolean,
): TriCount {
  const artifacts = artifactsOrUndefined(rc);
  if (artifacts === undefined) {
    return undefined;
  }
  return artifacts.filter(
    (artifact) => categories.includes(artifact.category) && (!specificOnly || artifact.specific === true),
  ).length;
}

function presentByCategories(rc: RepoContextData | undefined, categories: readonly ArtifactCategory[]): TriBoolean {
  const count = countByCategories(rc, categories, false);
  return count === undefined ? undefined : count > 0;
}

/** `H2.p1` — `RC.identity_file_specific`. */
export function identityFileSpecific(rc: RepoContextData | undefined): TriBoolean {
  const count = countByCategories(rc, ["identite"], true);
  return count === undefined ? undefined : count > 0;
}

/** `H3.p1`, première feuille — `RC.memory_files_specific_count`. */
export function memoryFilesSpecificCount(rc: RepoContextData | undefined): TriCount {
  return countByCategories(rc, ["memoire"], true);
}

/** `H4.p1` — `RC.behavior_artifacts_specific_count` (règle/skill/agent, + prompt en approximation de « commande », voir tête de fichier). */
export function behaviorArtifactsSpecificCount(rc: RepoContextData | undefined): TriCount {
  return countByCategories(rc, ["regle", "skill", "agent", "prompt"], true);
}

/** `H5.p1` — `RC.guardrail_artifact_present` : simple présence, catégorie `hook` ou `deny-list`. */
export function guardrailArtifactPresent(rc: RepoContextData | undefined): TriBoolean {
  return presentByCategories(rc, ["hook", "deny-list"]);
}

const LOOP_ARTIFACT_PATTERN = /retry|loop|until[-_]?green|auto[-_]?heal|self[-_]?heal/i;

/**
 * `H6.p1` — `RC.loop_artifact_executable` : hook SPÉCIFIQUE (voir « H6 vs H5 »
 * en tête de fichier) DONT LE NOM suggère une boucle de relance (retry/loop/
 * until-green/auto-heal/self-heal), pas n'importe quel hook spécifique.
 *
 * Un hook peut être parfaitement `specific` (chemins plausibles cités, ≥ 10
 * lignes utiles) sans être une boucle : un linter qui contrôle un diff une
 * seule fois et sort en erreur sans jamais se relancer est un garde-fou (H5),
 * pas une boucle de relance jusqu'au vert (H6). La seule façon de distinguer
 * les deux SANS lire le contenu (`RepoContextArtifact` n'expose pas `content`)
 * est le nom du fichier — même schéma heuristique que `matchesFilenamePattern`
 * ci-dessous, déjà utilisé pour `evals`/`trust tier`.
 */
export function loopArtifactExecutable(rc: RepoContextData | undefined): TriBoolean {
  const artifacts = artifactsOrUndefined(rc);
  if (artifacts === undefined) {
    return undefined;
  }
  return artifacts.some(
    (artifact) => artifact.category === "hook" && artifact.specific === true && LOOP_ARTIFACT_PATTERN.test(artifact.relPath),
  );
}

// Ce signal expose le COMPTE brut, comme `memoryFilesSpecificCount` (H3) et
// `behaviorArtifactsSpecificCount` (H4) juste au-dessus, jamais un booléen
// déjà comparé à un seuil en dur : le seuil `>= 2` vit dans
// `src/referentiel.json` (`thresholds["H7.p1"]`,
// `signal_id: "RC.multi_agent_orchestrator_count"`), lu par
// `lib/threshold-eval.ts` comme toute autre condition numérique.

/** `H7.p1`, première feuille — `RC.multi_agent_orchestrator_count` : nombre d'artefacts `agent` spécifiques (seuil `>= 2` déclaré dans `referentiel.json`, pas ici). */
export function multiAgentOrchestratorCount(rc: RepoContextData | undefined): TriCount {
  return countByCategories(rc, ["agent"], true);
}

const EVAL_PATTERN = /eval/i;
const TRUST_TIER_PATTERN = /trust[-_]?tier/i;
const CIRCUIT_BREAKER_PATTERN = /circuit[-_]?breaker/i;

function matchesFilenamePattern(
  rc: RepoContextData | undefined,
  pattern: RegExp,
  excludeCapitalisation: boolean,
): TriBoolean {
  const artifacts = artifactsOrUndefined(rc);
  if (artifacts === undefined) {
    return undefined;
  }
  return artifacts.some(
    (artifact) => (!excludeCapitalisation || artifact.category !== "capitalisation") && pattern.test(artifact.relPath),
  );
}

/** `O5.p1`, première feuille — `RC.evals_versioned_present` (toute catégorie, y compris `capitalisation` : axe Ownership, pas H). */
export function evalsVersionedPresent(rc: RepoContextData | undefined): TriBoolean {
  return matchesFilenamePattern(rc, EVAL_PATTERN, false);
}

/** `O5.p1`, seconde feuille — `RC.trust_tier_or_circuit_breaker_present`. */
export function trustTierOrCircuitBreakerPresent(rc: RepoContextData | undefined): TriBoolean {
  const trust = matchesFilenamePattern(rc, TRUST_TIER_PATTERN, false);
  const breaker = matchesFilenamePattern(rc, CIRCUIT_BREAKER_PATTERN, false);
  if (trust === undefined && breaker === undefined) {
    return undefined;
  }
  return (trust ?? false) || (breaker ?? false);
}

/** `H7.p1`, seconde feuille — `RC.evals_or_trust_tier_present`, EXCLUT `capitalisation` (axe H, voir tête de fichier). */
export function evalsOrTrustTierPresentForH(rc: RepoContextData | undefined): TriBoolean {
  const evals = matchesFilenamePattern(rc, EVAL_PATTERN, true);
  const trust = matchesFilenamePattern(rc, TRUST_TIER_PATTERN, true);
  const breaker = matchesFilenamePattern(rc, CIRCUIT_BREAKER_PATTERN, true);
  if (evals === undefined && trust === undefined && breaker === undefined) {
    return undefined;
  }
  return (evals ?? false) || (trust ?? false) || (breaker ?? false);
}

/** `O3.p1` — `RC.capitalization_artifact_specific_count` (SEULE fonction de ce module autorisée à lire `"capitalisation"` pour une marche hors axe H). */
export function capitalizationArtifactSpecificCount(rc: RepoContextData | undefined): TriCount {
  return countByCategories(rc, ["capitalisation"], true);
}

const REVIEW_PATTERN = /review/i;

/** `O4.p1`, première feuille — `RC.review_agent_present` : artefact `agent`/`prompt` spécifique dont le nom évoque une revue. */
export function reviewAgentPresent(rc: RepoContextData | undefined): TriBoolean {
  const artifacts = artifactsOrUndefined(rc);
  if (artifacts === undefined) {
    return undefined;
  }
  return artifacts.some(
    (artifact) =>
      (artifact.category === "agent" || artifact.category === "prompt") &&
      artifact.specific === true &&
      REVIEW_PATTERN.test(artifact.relPath),
  );
}

/**
 * `O4.p1`, seconde feuille — `RC.approval_gate_present` : réutilise
 * {@link guardrailArtifactPresent} (`hook`/`deny-list`) — un deny-list/hook EST
 * structurellement un mécanisme d'approbation/blocage, cohérent avec `H5` et évite
 * un motif de nom de fichier qui ne matcherait jamais aucun des 4 étalons réels.
 */
export function approvalGatePresent(rc: RepoContextData | undefined): TriBoolean {
  return guardrailArtifactPresent(rc);
}
