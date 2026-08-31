/**
 * `I3.p2` (« aux étapes clés », voie session).
 * Preuve/contre-preuve (force `"indice"`, figée par `referentiel.json`) :
 * `S.milestone_framing_present` — question de clarification suivie d'une
 * réponse, OU plan/phases/étape évoqués avant l'écriture
 * (`lib/session-signals.ts`.`milestoneFramingPresent`, combine les deux motifs
 * « question de clarification + réponse » et « "plan"/"phases"/"étape" avant
 * écriture »). Négation complète par défaut pour la contre-preuve — suffit
 * ici.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { milestoneFramingPresent } from "../../lib/session-signals.js";

const CHECK_ID = "I3.session";
const PATH_ID = "I3.p2";

const check: Check = {
  id: CHECK_ID,
  axe: "I",
  marche: "I3",
  sources: ["S"],
  pack: "core-session",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "S.milestone_framing_present": milestoneFramingPresent(context.session),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "I", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
