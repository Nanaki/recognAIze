/**
 * `T3.p2` (variante PR de « feature L planifiée »). Le référentiel exprime
 * `PR.median_files_changed > 12 OR PR.median_layers_touched ≥ 2`.
 *
 * `PullRequestsData` (`sources/pull-requests.ts`) ne calcule aucune notion de
 * « couches touchées » — aucun champ ne permet de distinguer les fichiers par
 * couche applicative (frontend/backend/infra…). Le signal
 * `PR.median_layers_touched` reste donc VOLONTAIREMENT non renseigné
 * (`undefined`) ici — jamais inventé. Conséquence, par construction de
 * `evaluateExpr` (`or`, 3 valeurs) : cette branche du `or` ne peut plus jamais
 * décider `"false"`, donc `T3.p2` ne peut plus jamais devenir contre-preuve via
 * ce check — seule la branche `files > 12` peut la prouver ; sinon la marche
 * reste `"unknown"` (aucune `Evidence`) plutôt qu'infirmée à tort. La contre-preuve
 * de `T3` reste possible via `T3.git-activity.ts` (`GA.size_median`).
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import type { MedianResult } from "../../sources/pull-requests.js";

const CHECK_ID = "T3.pull-requests";
const PATH_ID = "T3.p2";

function medianValue(result: MedianResult | undefined): SignalValue {
  return result !== undefined && result.status === "ok" ? result.value : undefined;
}

const check: Check = {
  id: CHECK_ID,
  axe: "T",
  marche: "T3",
  sources: ["PR"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "PR.median_files_changed": medianValue(context.pullRequests?.medianChangedFiles),
      // "PR.median_layers_touched" volontairement absent — voir la docstring ci-dessus.
    };
    const evidence = evaluateProofPathDefault({
      referentiel,
      checkId: CHECK_ID,
      pathId: PATH_ID,
      axe: "T",
      signals,
    });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
