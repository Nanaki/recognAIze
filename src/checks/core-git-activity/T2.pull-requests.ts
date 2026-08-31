/**
 * `T2.p2` (variante PR de « feature M »). `referentiel.json` exprime la
 * structure complète (`or` de deux `and` : fichiers 5-12, OU lignes 150-500)
 * — évaluée telle quelle via `evaluateExpr` pour la PREUVE, jamais réinventée
 * ici.
 *
 * Ce check ne produit JAMAIS de contre-preuve — seulement une preuve ou une
 * absence d'`Evidence`. `referentiel.json`.`T2.counter_proof.signal_id` vaut
 * `"GA.size_median"`, pas un signal `PR.*` : la contre-preuve documentée de
 * `T2` (« médiane ≤ S ») est donc explicitement portée par
 * `T2.git-activity.ts` seul (même lecture appliquée à `T3` :
 * `T3.counter_proof.signal_id` vaut lui aussi `"GA.size_median"`, et
 * `T3.pull-requests.ts` ne contre-preuve jamais non plus). La négation
 * complète par défaut (`evaluateProofPathDefault`) serait ici un défaut de
 * conception : la négation de « fichiers dans 5-12 OU lignes dans 150-500 »
 * inclut aussi bien « PR plus PETITE que la fenêtre M » que « PR bien plus
 * GROSSE que la fenêtre M » — ce second cas n'est PAS « médiane ≤ S », il ne
 * doit donc jamais contre-prouver `T2`. Avec la négation complète, une PR
 * PLUS GROSSE que M produirait une contre-preuve PR qui, par précédence de
 * source (RC > PR > GA), écraserait une preuve GA légitime (`GA.size_median`
 * à `L`, `≥ M`) — un profil aux PR clairement plus grandes que M se
 * retrouverait donc infirmé sur `T2`, bloquant Blue/Green à tort en dépit
 * d'une taille GA largement suffisante. Seule la preuve (branche `"true"`)
 * est donc conservée ici ; toute autre issue (bande non atteinte, signal
 * manquant) rend `[]` — jamais de contre-preuve depuis la voie PR de `T2`.
 */

import type { Check } from "../../core/types.js";
import { thresholdFor } from "../../core/referentiel.js";
import { buildEvidence, evaluateExpr, formatExprCitation, type SignalValue } from "../../lib/threshold-eval.js";
import type { MedianResult } from "../../sources/pull-requests.js";

const CHECK_ID = "T2.pull-requests";
const PATH_ID = "T2.p2";

function medianValue(result: MedianResult | undefined): SignalValue {
  return result !== undefined && result.status === "ok" ? result.value : undefined;
}

const check: Check = {
  id: CHECK_ID,
  axe: "T",
  marche: "T2",
  sources: ["PR"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "PR.median_files_changed": medianValue(context.pullRequests?.medianChangedFiles),
      "PR.median_lines_changed": medianValue(context.pullRequests?.medianLinesChanged),
    };
    const proofEval = evaluateExpr(thresholdFor(referentiel, PATH_ID), signals);
    if (proofEval.result !== "true") {
      return [];
    }
    return [
      buildEvidence({
        referentiel,
        checkId: CHECK_ID,
        pathId: PATH_ID,
        axe: "T",
        polarite: "preuve",
        citation: formatExprCitation(proofEval),
        valueType: "count",
        unit: "fichiers",
      }),
    ];
  },
};

export default check;
