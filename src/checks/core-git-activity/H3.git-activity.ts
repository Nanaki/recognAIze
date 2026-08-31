/**
 * `H3.p2` (« mémoire vivante », compteur GA). Preuve :
 * `GA.agents_md === true ET last_updated dans la fenêtre`
 * (`lib/agents-md-window.ts`, qui re-dérive la fenêtre localement).
 * Contre-preuve : règle « `context_files` tout à zéro », même schéma que
 * `H2.git-activity.ts`.
 */

import type { Check } from "../../core/types.js";
import { thresholdFor } from "../../core/referentiel.js";
import { buildEvidence, evaluateExpr, formatExprCitation, type SignalValue } from "../../lib/threshold-eval.js";
import { contextFilesAllZero } from "../../lib/context-files-signal.js";
import { isAgentsMdMaintainedInWindow } from "../../lib/agents-md-window.js";

const CHECK_ID = "H3.git-activity";
const PATH_ID = "H3.p2";

const check: Check = {
  id: CHECK_ID,
  axe: "H",
  marche: "H3",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const contextFiles = context.gitActivity?.context_files;
    const signals: Record<string, SignalValue> = {
      "GA.agents_md": contextFiles?.agents_md,
      "GA.agents_md_last_updated_in_window": isAgentsMdMaintainedInWindow(
        context.gitActivity?.period,
        contextFiles?.last_updated,
      ),
    };
    const proofEval = evaluateExpr(thresholdFor(referentiel, PATH_ID), signals);
    if (proofEval.result === "true") {
      return [
        buildEvidence({
          referentiel,
          checkId: CHECK_ID,
          pathId: PATH_ID,
          axe: "H",
          polarite: "preuve",
          citation: formatExprCitation(proofEval),
          valueType: "boolean",
          unit: "",
        }),
      ];
    }

    if (contextFilesAllZero(context.gitActivity) === true) {
      return [
        buildEvidence({
          referentiel,
          checkId: CHECK_ID,
          pathId: PATH_ID,
          axe: "H",
          polarite: "contre-preuve",
          citation: "GA.context_files tous à zéro (agents_md=false, rules=0, skills=0, hooks=0, agents=0)",
          valueType: "boolean",
          unit: "",
        }),
      ];
    }

    return [];
  },
};

export default check;
