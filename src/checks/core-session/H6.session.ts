/**
 * `H6.p2` (« boucles — indice session »). Preuve/contre-preuve
 * (force `"indice"`, figée par `referentiel.json`) : `S.autonomous_retry_until_green`
 * — l'agent relance seul les checks jusqu'au vert
 * (`lib/session-signals.ts`.`autonomousRetryUntilGreen`). Négation complète par
 * défaut pour la contre-preuve — suffit ici. `H6.repo-context.ts`
 * couvre la voie `RC` (preuve forte, artefact exécutable).
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { autonomousRetryUntilGreen } from "../../lib/session-signals.js";

const CHECK_ID = "H6.session";
const PATH_ID = "H6.p2";

const check: Check = {
  id: CHECK_ID,
  axe: "H",
  marche: "H6",
  sources: ["S"],
  pack: "core-session",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "S.autonomous_retry_until_green": autonomousRetryUntilGreen(context.session),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "H", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
