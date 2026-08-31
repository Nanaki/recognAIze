/**
 * `H4.p2` (« comportements versionnés », compteur GA). Preuve :
 * `rules_count + skills_count + agents_count ≥ 1`. Contre-preuve : règle
 * « `context_files` tout à zéro », même schéma que `H2`/`H3`.
 */

import type { Check } from "../../core/types.js";
import { thresholdFor } from "../../core/referentiel.js";
import { buildEvidence, evaluateExpr, formatExprCitation, type SignalValue } from "../../lib/threshold-eval.js";
import { contextFilesAllZero } from "../../lib/context-files-signal.js";

const CHECK_ID = "H4.git-activity";
const PATH_ID = "H4.p2";

function rulesSkillsAgentsCount(contextFiles: { rules_count?: number; skills_count?: number; agents_count?: number } | undefined): SignalValue {
  if (contextFiles === undefined) {
    return undefined;
  }
  const { rules_count: rules, skills_count: skills, agents_count: agents } = contextFiles;
  if (rules === undefined && skills === undefined && agents === undefined) {
    return undefined;
  }
  return (rules ?? 0) + (skills ?? 0) + (agents ?? 0);
}

const check: Check = {
  id: CHECK_ID,
  axe: "H",
  marche: "H4",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "GA.rules_skills_agents_count": rulesSkillsAgentsCount(context.gitActivity?.context_files),
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
          unit: "artefacts",
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
          unit: "artefacts",
        }),
      ];
    }

    return [];
  },
};

export default check;
