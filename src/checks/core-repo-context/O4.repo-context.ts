/**
 * `O4.p1` (« délègue raisonnablement », voie RC). Preuve :
 * `RC.review_agent_present OU RC.approval_gate_present`
 * (`lib/repo-context-signals.ts`) : un artefact `"agent"`/`"prompt"` spécifique
 * dont le nom évoque une revue, OU un artefact `"hook"`/`"deny-list"` (réutilise
 * {@link import("../../lib/repo-context-signals.js").guardrailArtifactPresent}
 * via `approvalGatePresent` — un deny-list/hook EST structurellement un
 * mécanisme d'approbation/blocage).
 *
 * Contre-preuve : négation complète par défaut (les deux `false`, RC fourni) —
 * suffit ici, donne exactement « RC fourni sans reviewer ni gate », la
 * contre-preuve documentée par `referentiel.json`.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { approvalGatePresent, reviewAgentPresent } from "../../lib/repo-context-signals.js";

const CHECK_ID = "O4.repo-context";
const PATH_ID = "O4.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "O",
  marche: "O4",
  sources: ["RC"],
  pack: "core-repo-context",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "RC.review_agent_present": reviewAgentPresent(context.repoContext),
      "RC.approval_gate_present": approvalGatePresent(context.repoContext),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "O", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
