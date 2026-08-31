/**
 * `I3.p1` (« aux étapes clés »). Preuve : `median_correction_commits_after_open ≤ 1`.
 * Contre-preuve : négation complète (`> 1`) — coïncide exactement avec
 * `I3.counter_proof` (« GA corr > 1 »). Même champ source que
 * `I2.git-activity.ts`, seuil différent (`I3.p1` vs `I2.p1`).
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";

const CHECK_ID = "I3.git-activity";
const PATH_ID = "I3.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "I",
  marche: "I3",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "GA.median_correction_commits_after_open": context.gitActivity?.pull_requests?.median_correction_commits_after_open,
    };
    const evidence = evaluateProofPathDefault({
      referentiel,
      checkId: CHECK_ID,
      pathId: PATH_ID,
      axe: "I",
      signals,
    });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
