/**
 * `O2.p3` (« vérifie », voie session). Preuve/contre-preuve
 * (force `"indice"`, figée par `referentiel.json`) : `S.tests_first_seen_failing`
 * — « commence par les tests » ou `[N tests … échec]`
 * (`lib/session-signals.ts`.`testsFirstSeenFailing`). Négation complète par
 * défaut pour la contre-preuve — suffit ici.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { testsFirstSeenFailing } from "../../lib/session-signals.js";

const CHECK_ID = "O2.session";
const PATH_ID = "O2.p3";

const check: Check = {
  id: CHECK_ID,
  axe: "O",
  marche: "O2",
  sources: ["S"],
  pack: "core-session",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "S.tests_first_seen_failing": testsFirstSeenFailing(context.session),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "O", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
