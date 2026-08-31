/**
 * `H2.p2` (« identité projet », compteur GA). Preuve : `GA.agents_md === true`.
 * Contre-preuve : PAS la simple négation (`agents_md === false` seul ne prouve
 * rien — d'autres artefacts d'identité, hors convention `AGENTS.md`, restent
 * possibles et sont l'affaire de `RC`) — la règle retenue est `context_files`
 * ENTIÈREMENT à zéro (`lib/context-files-signal.ts`, partagé par `H2`-`H5` ;
 * `H6`/`H7` consomment le même signal côté `RC`). Construction directe via
 * `buildEvidence` (pas `evaluateProofPathDefault`, dont la négation complète
 * serait ici trop large).
 */

import type { Check } from "../../core/types.js";
import { thresholdFor } from "../../core/referentiel.js";
import { buildEvidence, evaluateExpr, formatExprCitation } from "../../lib/threshold-eval.js";
import { contextFilesAllZero } from "../../lib/context-files-signal.js";

const CHECK_ID = "H2.git-activity";
const PATH_ID = "H2.p2";

const check: Check = {
  id: CHECK_ID,
  axe: "H",
  marche: "H2",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const agentsMd = context.gitActivity?.context_files?.agents_md;
    const proofEval = evaluateExpr(thresholdFor(referentiel, PATH_ID), { "GA.agents_md": agentsMd });
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
