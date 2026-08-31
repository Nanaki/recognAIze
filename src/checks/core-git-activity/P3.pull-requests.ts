/**
 * `P3.p2` (« ≥ 3 habituellement », voie PR). Preuve :
 * `median_overlap_count ≥ 3`. Contre-preuve : négation complète (`< 3`) —
 * coïncide avec la contre-preuve documentée (« PR recouvrement médian < 3 »).
 *
 * `PullRequestsData` n'expose aucun compteur de branches concurrentes — le
 * signal le plus proche déjà calculé par `sources/pull-requests.ts` est
 * `medianCreatedToMergedDays` (jours entre ouverture et fusion des PR mergées
 * dans la fenêtre), retenu ici comme réalisation de `PR.median_overlap_count` :
 * une PR ouverte longtemps avant fusion recouvre plus probablement d'autres
 * chantiers en parallèle — proxy documenté, pas une mesure directe du nombre
 * de branches concurrentes.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";

const CHECK_ID = "P3.pull-requests";
const PATH_ID = "P3.p2";

const check: Check = {
  id: CHECK_ID,
  axe: "P",
  marche: "P3",
  sources: ["PR"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const overlap = context.pullRequests?.medianCreatedToMergedDays;
    const signals: Record<string, SignalValue> = {
      "PR.median_overlap_count": overlap !== undefined && overlap.status === "ok" ? overlap.value : undefined,
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
