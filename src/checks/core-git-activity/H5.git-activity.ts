/**
 * `H5.p2` (« guardrails », compteur GA). Preuve : `hooks_count ≥ 1`.
 * Contre-preuve : règle « `context_files` tout à zéro », même schéma que
 * `H2`-`H4`.
 */

import type { Check } from "../../core/types.js";
import { thresholdFor } from "../../core/referentiel.js";
import { buildEvidence, evaluateExpr, formatExprCitation, type SignalValue } from "../../lib/threshold-eval.js";
import { contextFilesAllZero } from "../../lib/context-files-signal.js";

const CHECK_ID = "H5.git-activity";
const PATH_ID = "H5.p2";

const check: Check = {
  id: CHECK_ID,
  axe: "H",
  marche: "H5",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "GA.hooks_count": context.gitActivity?.context_files?.hooks_count,
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
          valueType: "count",
          unit: "hooks",
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
          valueType: "count",
          unit: "hooks",
        }),
      ];
    }

    return [];
  },
};

export default check;
