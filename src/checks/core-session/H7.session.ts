/**
 * `H7.p2` (« orchestration gouvernée — indice session »).
 * Preuve/contre-preuve (force `"indice"`, figée par `referentiel.json`) :
 * `S.subagents_orchestrated` — sous-agents orchestrés
 * (`lib/session-signals.ts`.`subagentsOrchestrated`). Négation complète par
 * défaut pour la contre-preuve — suffit ici. `H7.repo-context.ts`
 * couvre la voie `RC` (preuve forte).
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { subagentsOrchestrated } from "../../lib/session-signals.js";

const CHECK_ID = "H7.session";
const PATH_ID = "H7.p2";

const check: Check = {
  id: CHECK_ID,
  axe: "H",
  marche: "H7",
  sources: ["S"],
  pack: "core-session",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "S.subagents_orchestrated": subagentsOrchestrated(context.session),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "H", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
