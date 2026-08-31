/**
 * `O3.p3` (« comprend et capitalise », voie session).
 * Preuve/contre-preuve (force `"indice"`, figée par `referentiel.json`) :
 * `S.context_correction_or_rca_present` — « pourquoi », « cause », ou TODO
 * documenté (`lib/session-signals.ts`.`contextCorrectionOrRcaPresent`).
 * Négation complète par défaut pour la contre-preuve — suffit ici.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { contextCorrectionOrRcaPresent } from "../../lib/session-signals.js";

const CHECK_ID = "O3.session";
const PATH_ID = "O3.p3";

const check: Check = {
  id: CHECK_ID,
  axe: "O",
  marche: "O3",
  sources: ["S"],
  pack: "core-session",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "S.context_correction_or_rca_present": contextCorrectionOrRcaPresent(context.session),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "O", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
