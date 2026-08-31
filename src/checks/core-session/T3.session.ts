/**
 * `T3.p3` (« feature L planifiée », voie session).
 * Preuve/contre-preuve (force `"indice"`, figée par `referentiel.json`) :
 * `S.has_phased_plan ET S.layers_touched ≥ 2` — « plan », « phases », « étape »
 * évoqués, et ≥2 catégories de couches distinctes évoquées
 * (`lib/session-signals.ts`.`hasPhasedPlan`/`layersTouchedCount`, dictionnaire
 * fixe de mots-clés de couche — proxy structurel, même limite que
 * `T3.pull-requests.ts`.`median_layers_touched`). Négation complète par
 * défaut pour la contre-preuve — suffit ici.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { hasPhasedPlan, layersTouchedCount } from "../../lib/session-signals.js";

const CHECK_ID = "T3.session";
const PATH_ID = "T3.p3";

const check: Check = {
  id: CHECK_ID,
  axe: "T",
  marche: "T3",
  sources: ["S"],
  pack: "core-session",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "S.has_phased_plan": hasPhasedPlan(context.session),
      "S.layers_touched": layersTouchedCount(context.session),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "T", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
