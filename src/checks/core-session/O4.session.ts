/**
 * `O4.p3` (« délègue raisonnablement », voie session).
 * Preuve/contre-preuve (force `"indice"`, figée par `referentiel.json`) :
 * `S.ai_review_before_pr` — « revue IA avant PR »
 * (`lib/session-signals.ts`.`aiReviewBeforePr`). Négation complète par défaut
 * pour la contre-preuve — suffit ici.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { aiReviewBeforePr } from "../../lib/session-signals.js";

const CHECK_ID = "O4.session";
const PATH_ID = "O4.p3";

const check: Check = {
  id: CHECK_ID,
  axe: "O",
  marche: "O4",
  sources: ["S"],
  pack: "core-session",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "S.ai_review_before_pr": aiReviewBeforePr(context.session),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "O", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
