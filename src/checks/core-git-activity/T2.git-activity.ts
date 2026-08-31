/**
 * `T2.p1` (« feature M »). Preuve : `GA.size_median ≥ M`. Contre-preuve :
 * négation complète (`GA.size_median < M`, soit ≤ S — un seul cran en dessous
 * de M dans les 5 classes ordonnées) — la négation complète coïncide ici
 * exactement avec la contre-preuve documentée par le référentiel
 * (`T2.counter_proof` : « GA/PR médiane ≤ S »), contrairement à `T4` (voir son
 * fichier). `evaluateProofPathDefault` (`lib/threshold-eval.ts`) s'applique donc
 * directement, sans règle particulière.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { sizeMedianSignal } from "../../lib/size-median-signal.js";

const CHECK_ID = "T2.git-activity";

const check: Check = {
  id: CHECK_ID,
  axe: "T",
  marche: "T2",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: ["T2.p1"],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "GA.size_median": sizeMedianSignal(context.gitActivity),
    };
    const evidence = evaluateProofPathDefault({
      referentiel,
      checkId: CHECK_ID,
      pathId: "T2.p1",
      axe: "T",
      signals,
    });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
