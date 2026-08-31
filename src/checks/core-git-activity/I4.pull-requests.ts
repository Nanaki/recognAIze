/**
 * `I4.p1`, voie précise. Actif seulement quand `context.pullRequests` est
 * présent (`pull-requests.json` lu avec succès, même « présent mais muet ») :
 * le dénominateur devient `PullRequestsData.mergedInWindowCount` (PR mergées
 * dans la fenêtre d'analyse), plus précis que `pull_requests.total` (repli de
 * `I4.git-activity.ts`, jamais exécuté simultanément). Le numérateur
 * (`merged_without_human_edit_after_open`) reste un champ GA — ce check lit donc
 * les deux sources ; `Evidence.source` est explicitement attribuée à `PR`
 * (`sourceOverride`), la source qui détermine la précision du dénominateur, bien
 * que `referentiel.json` déclare `I4.p1` sous `source: "GA"` par défaut.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";

const CHECK_ID = "I4.pull-requests";
const PATH_ID = "I4.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "I",
  marche: "I4",
  sources: ["PR", "GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    if (context.pullRequests === undefined) {
      // pull-requests.json absent : I4.git-activity.ts porte l'approximation.
      return [];
    }
    const numerator = context.gitActivity?.pull_requests?.merged_without_human_edit_after_open;
    const denominator = context.pullRequests.mergedInWindowCount;
    if (numerator === undefined || denominator <= 0) {
      return [];
    }
    const ratio = numerator / denominator;
    const signals: Record<string, SignalValue> = {
      "GA.merged_without_human_edit_ratio": ratio,
      "GA.ai_coauthored_ratio": context.gitActivity?.commits?.ai_coauthored_ratio,
    };
    const evidence = evaluateProofPathDefault({
      referentiel,
      checkId: CHECK_ID,
      pathId: PATH_ID,
      axe: "I",
      signals,
      sourceOverride: "PR",
      extraCitation: `dénominateur précis : ${numerator}/${denominator} PR mergées dans la fenêtre`,
    });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
