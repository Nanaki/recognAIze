/**
 * `I4.p1` (« jamais une fois cadré »), voie de repli. Le référentiel compose
 * `merged_without_human_edit_ratio ≥ 0,8 ET ai_coauthored_ratio ≥ 0,9`
 * (`I4.p1`, un seul `and`, jamais réinventé — `evaluateProofPathDefault`
 * l'évalue tel quel).
 *
 * Le dénominateur doit être PRÉCIS (PR mergées dans la fenêtre,
 * `PullRequestsData.mergedInWindowCount`) quand `pull-requests.json` est
 * présent, sinon une APPROXIMATION (`pull_requests.total`). Ce choix est
 * porté par DEUX checks mutuellement exclusifs déclarant tous deux `I4.p1` :
 * celui-ci (repli, actif seulement quand `context.pullRequests` est absent —
 * fichier introuvable/illisible, jamais « présent mais vide », voir
 * `sources/pull-requests.ts`) et `I4.pull-requests.ts` (précis, actif
 * seulement quand `context.pullRequests` est présent). Jamais les deux à la
 * fois pour un même profil ⇒ jamais deux `Evidence` contradictoires sur
 * `I4.p1`. La citation nomme explicitement l'approximation.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";

const CHECK_ID = "I4.git-activity";
const PATH_ID = "I4.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "I",
  marche: "I4",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    if (context.pullRequests !== undefined) {
      // pull-requests.json présent : I4.pull-requests.ts porte le dénominateur précis.
      return [];
    }
    const numerator = context.gitActivity?.pull_requests?.merged_without_human_edit_after_open;
    const denominator = context.gitActivity?.pull_requests?.total;
    if (numerator === undefined || denominator === undefined || denominator <= 0) {
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
      extraCitation: `approximation : pull-requests.json absent, dénominateur = pull_requests.total (${numerator}/${denominator})`,
    });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
