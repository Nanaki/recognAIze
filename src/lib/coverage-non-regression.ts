/**
 * Non-régression de couverture, consommé par `O2.git-activity.ts`.
 * `referentiel.json`.`O2.p1` compose `GA.prs_with_tests_ratio ≥ 0,5` ET un booléen
 * `SO.coverage_non_regression` — mais la grammaire de `ThresholdExpr`
 * (`core/referentiel.ts`) ne sait exprimer qu'une comparaison signal/constante, pas
 * une comparaison ENTRE deux valeurs observées avec une tolérance (`coverage_end
 * ≥ coverage_start − 0,02`). Cette tolérance est donc une constante structurelle
 * de calcul de signal, au même titre que l'ordre des 5 classes dans
 * `lib/median-from-buckets.ts` — codée ici plutôt que dans `referentiel.json`,
 * exemptée de la garde anti-littéral par un commentaire `anti-littéral-lib:`
 * sur sa ligne : dette technique assumée et documentée, jamais un
 * contournement silencieux.
 *
 * Bien que le `signal_id` porte le préfixe `SO.` dans le référentiel, `O2.p1`
 * déclare `source: "GA"` — et `coverage_start`/`coverage_end` vivent bien dans
 * `git-activity.json`.`tests` (`GitActivityTests`), jamais dans `sonar.json`.
 * Ce module lit donc uniquement des données GA ; le `SO.` du `signal_id` est
 * une étiquette héritée, pas une indication de source réelle — `O2.sonar.ts`
 * porte un signal Sonar distinct pour le badge qualité, sans lien avec ce
 * calcul.
 */

// Seuil réel consommé par O2.git-activity.ts (voir la docstring de tête) —
// reste ici, PAS dans referentiel.json, car ThresholdExpr (core/referentiel.ts)
// ne sait exprimer qu'une comparaison signal/constante, jamais
// signal-vs-signal-avec-tolérance (coverage_end >= coverage_start -
// tolérance). Dette technique documentée et assumée, pas un oubli : étendre
// la grammaire de ThresholdExpr reste hors périmètre (risque sur le
// calibrage des 4 étalons gardé par evals/holdout.json).
const COVERAGE_DROP_TOLERANCE = 0.02; // anti-littéral-lib: seuil réel, voir le commentaire ci-dessus (dette technique documentée, pas un oubli).

/** `undefined` si l'une des deux bornes manque (pas de conclusion possible), sinon `coverage_end ≥ coverage_start − 0,02`. */
export function coverageNonRegression(coverageStart: number | undefined, coverageEnd: number | undefined): boolean | undefined {
  if (coverageStart === undefined || coverageEnd === undefined) {
    return undefined;
  }
  return coverageEnd >= coverageStart - COVERAGE_DROP_TOLERANCE;
}
