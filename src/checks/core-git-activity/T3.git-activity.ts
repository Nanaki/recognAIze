/**
 * `T3.p1` (« feature L planifiée »). Preuve : `GA.size_median ≥ L`.
 * Contre-preuve : négation complète (`< L`, soit ≤ M) — coïncide exactement avec
 * la contre-preuve documentée (« GA/PR médiane ≤ M »). Même schéma que `T2`.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { sizeMedianSignal } from "../../lib/size-median-signal.js";

const CHECK_ID = "T3.git-activity";

const check: Check = {
  id: CHECK_ID,
  axe: "T",
  marche: "T3",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: ["T3.p1"],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "GA.size_median": sizeMedianSignal(context.gitActivity),
    };
    const evidence = evaluateProofPathDefault({
      referentiel,
      checkId: CHECK_ID,
      pathId: "T3.p1",
      axe: "T",
      signals,
    });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
