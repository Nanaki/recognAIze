/**
 * Badge qualité Sonar. Consommé par `src/checks/core-repo-context/O2.sonar.ts`,
 * purement INFORMATIF : ce module n'est jamais appelé par `core/judge.ts` ni
 * par aucun chemin produisant une `Evidence` — `O2.sonar.ts` reste un NO-OP
 * côté registre (`path_ids: []`, même schéma que `T1.default.ts`), exactement
 * pour garantir que ce calcul ne puisse JAMAIS entrer dans un rang/niveau/
 * fourchette (le badge qualité n'entre dans aucun calcul de niveau, de rang
 * ou de fourchette — vérifié par `test/lib/quality-badge.test.ts`, qui prouve
 * l'absence totale de tout import de ce module par `core/judge.ts` ou
 * `core/registry.ts`).
 *
 * Réutilise `coverageNonRegression` (`lib/coverage-non-regression.ts`) pour le
 * critère de couverture — même tolérance `-0,02`, jamais dupliquée.
 *
 * Critères disponibles seulement, jamais tout-ou-rien : seuls les critères
 * pour lesquels une donnée existe comptent (un critère manquant n'est ni un
 * succès ni un échec, il est simplement absent du calcul). `"non_evalue"`
 * seulement si LES 4 sont absents. `"rouge"` est testé EN PREMIER via la
 * combinaison sévère (chute de couverture ET CI > 0,3, seuil strictement plus
 * sévère que le seuil `vert`/`orange` de 0,2 sur ce même signal) ; sinon le
 * nombre de critères disponibles en échec décide : 0 ⇒ vert, 1 ⇒ orange,
 * `"rouge"` par défaut dès que ≥2 critères disponibles échouent (même sans
 * atteindre la combinaison sévère) — cohérent avec la lecture usuelle d'un
 * badge à 3 couleurs (vert/orange/rouge = 0/1/≥2 problèmes).
 */

import { coverageNonRegression } from "./coverage-non-regression.js";
import type { GitActivityData } from "../sources/git-activity.js";
import type { SonarData } from "../sources/sonar.js";

export type QualityBadge = "vert" | "orange" | "rouge" | "non_evalue";

// Seuils du badge qualité, purement informatif — voir la docstring de tête
// (« jamais appelé par core/judge.ts ni par aucun chemin produisant une
// Evidence », O2.sonar.ts reste un NO-OP path_ids: []). Pas un seuil
// consommé par un check, donc hors périmètre de referentiel.json (source de
// vérité des seuils de PREUVE, jamais d'affichage).
const DUPLICATION_MAX_RATIO = 0.1; // anti-littéral-lib: badge d'affichage, jamais consommé par un check (voir commentaire ci-dessus).
const CI_FAILURE_MAX_RATIO_GREEN = 0.2; // anti-littéral-lib: badge d'affichage, jamais consommé par un check.
const CI_FAILURE_MAX_RATIO_RED = 0.3; // anti-littéral-lib: badge d'affichage, jamais consommé par un check.

export function computeQualityBadge(
  sonar: SonarData | undefined,
  gitActivity: GitActivityData | undefined,
): QualityBadge {
  const coverageStart = gitActivity?.tests?.coverage_start;
  const coverageEnd = gitActivity?.tests?.coverage_end;
  const coverageOk = coverageNonRegression(coverageStart, coverageEnd);

  const bugs = sonar?.measures?.bugs;
  const bugsOk = bugs === undefined ? undefined : bugs === 0;

  const duplication = sonar?.measures?.duplicated_lines_density;
  const duplicationOk = duplication === undefined ? undefined : duplication <= DUPLICATION_MAX_RATIO;

  const ciFailureRate = gitActivity?.ci?.failure_rate;
  const ciOk = ciFailureRate === undefined ? undefined : ciFailureRate <= CI_FAILURE_MAX_RATIO_GREEN;

  const availableCriteria = [coverageOk, bugsOk, duplicationOk, ciOk].filter(
    (criterion): criterion is boolean => criterion !== undefined,
  );

  if (availableCriteria.length === 0) {
    return "non_evalue";
  }

  const severeCoverageDrop = coverageOk === false;
  const severeCiFailure = ciFailureRate !== undefined && ciFailureRate > CI_FAILURE_MAX_RATIO_RED;
  if (severeCoverageDrop && severeCiFailure) {
    return "rouge";
  }

  const failureCount = availableCriteria.filter((criterion) => criterion === false).length;
  if (failureCount === 0) {
    return "vert";
  }
  if (failureCount === 1) {
    return "orange";
  }
  return "rouge";
}
