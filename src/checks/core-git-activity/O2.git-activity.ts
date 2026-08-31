/**
 * `O2.p1` (« vérifie »). Preuve :
 * `prs_with_tests_ratio ≥ 0,5 ET coverage_non_regression` — `and` du référentiel,
 * évalué tel quel. Contre-preuve : négation complète (« tests < 0,5 OU
 * couverture en baisse ») — coïncide exactement avec `O2.counter_proof`. Le
 * second signal (`SO.coverage_non_regression`) est calculé par
 * `lib/coverage-non-regression.ts` à partir de `git-activity.json`.`tests`.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { coverageNonRegression } from "../../lib/coverage-non-regression.js";

const CHECK_ID = "O2.git-activity";
const PATH_ID = "O2.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "O",
  marche: "O2",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const tests = context.gitActivity?.tests;
    const signals: Record<string, SignalValue> = {
      "GA.prs_with_tests_ratio": tests?.prs_with_tests_ratio,
      "SO.coverage_non_regression": coverageNonRegression(tests?.coverage_start, tests?.coverage_end),
    };
    const evidence = evaluateProofPathDefault({
      referentiel,
      checkId: CHECK_ID,
      pathId: PATH_ID,
      axe: "O",
      signals,
    });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
