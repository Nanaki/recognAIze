/**
 * `P3.p1` (« ≥ 3 habituellement », voie GA). Preuve :
 * `median_concurrent_branches ≥ 3`. Contre-preuve : négation complète (`< 3`) —
 * coïncide avec la contre-preuve documentée (« GA médiane < 3 »).
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";

const CHECK_ID = "P3.git-activity";
const PATH_ID = "P3.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "P",
  marche: "P3",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "GA.median_concurrent_branches": context.gitActivity?.parallelism?.median_concurrent_branches,
    };
    const evidence = evaluateProofPathDefault({
      referentiel,
      checkId: CHECK_ID,
      pathId: PATH_ID,
      axe: "P",
      signals,
    });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
