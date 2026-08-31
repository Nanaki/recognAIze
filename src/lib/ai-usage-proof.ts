/**
 * Détecteur de preuve d'usage de l'IA. Décide si le juge
 * (`core/judge.ts`.`JudgeInput.hasAiUsageProof`) doit rendre un profil
 * `"indeterminate"` (aucune trace nulle part) ou ouvrir les 5 marches par défaut
 * `T1/H1/I1/P1/O1` (`core/judge.ts` sème lui-même ces marches en `"prouvé"` dès
 * que `hasAiUsageProof` est vrai, voir `computeAxis`).
 *
 * Contrat impératif : une MESURE OUTIL, jamais le déclaratif.
 * `ProfileContext.declaratif` n'est donc lu NULLE PART dans ce module — même
 * indirectement — conformément à DEC-004 (`DEC` a une `confiance_source` figée à
 * 0, ne prouve ni n'infirme jamais rien, y compris cette porte d'entrée du juge).
 *
 * 4 signaux, chacun mesuré par un adaptateur `sources/*.ts` différent, combinés
 * en OU (un seul suffit) :
 *   1. `GA.commits.ai_coauthored_ratio > 0` — `ai_coauthored_ratio` EST le
 *      signal qui agrège la présence de trailers de co-autorat IA en amont ;
 *      `git-activity.ts` (`GitActivityData`) n'expose pas de champ trailers
 *      séparé à croiser.
 *   2. Un artefact de harness est présent dans l'inventaire de `repo-context.ts`
 *      (`RepoContextData.artifacts.length > 0`) — l'identité/mémoire/règle/skill/
 *      agent/hook/deny-list/prompt/capitalisation détectés par cet adaptateur,
 *      peu importe la catégorie précise à ce stade (la distinction par catégorie
 *      est le travail des checks H2-H7).
 *   3. `session.ts` a produit un digest non vide (`SessionDigest.turnCount > 0`).
 *   4. `GA.assistant_usage.sessions_per_week > 0`.
 *
 * Aucun de ces 4 signaux ne lève jamais : chaque accès est optionnel-chaîné,
 * une pièce absente (`undefined`) ou un champ mal typé (déjà réduit à
 * `undefined` par l'adaptateur tolérant qui l'a produit, voir
 * `sources/tolerant-fields.ts`) ne compte simplement pas comme preuve — jamais
 * une exception, jamais un `NaN` traité comme positif.
 */

import type { ProfileContext } from "../core/types.js";

function hasAiCoauthoredCommits(ctx: ProfileContext): boolean {
  const ratio = ctx.gitActivity?.commits?.ai_coauthored_ratio;
  return typeof ratio === "number" && ratio > 0;
}

function hasHarnessArtifact(ctx: ProfileContext): boolean {
  const artifacts = ctx.repoContext?.artifacts;
  return Array.isArray(artifacts) && artifacts.length > 0;
}

function hasNonEmptySessionDigest(ctx: ProfileContext): boolean {
  const turnCount = ctx.session?.turnCount;
  return typeof turnCount === "number" && turnCount > 0;
}

function hasDeclaredAssistantSessions(ctx: ProfileContext): boolean {
  const sessionsPerWeek = ctx.gitActivity?.assistant_usage?.sessions_per_week;
  return typeof sessionsPerWeek === "number" && sessionsPerWeek > 0;
}

/**
 * `true` dès qu'UN des 4 signaux tool-measured ci-dessus est présent. Point
 * d'entrée unique consommé par `src/analyze.ts` avant d'appeler `judge()`.
 */
export function hasAiUsageProof(ctx: ProfileContext): boolean {
  return (
    hasAiCoauthoredCommits(ctx) ||
    hasHarnessArtifact(ctx) ||
    hasNonEmptySessionDigest(ctx) ||
    hasDeclaredAssistantSessions(ctx)
  );
}
