/**
 * `P2.p2` (« isolation & préparation », voie session).
 * Preuve/contre-preuve (force `"indice"`, figée par `referentiel.json`) :
 * `S.parallel_worktrees_mentioned` — « fil », « worktree », « en parallèle »
 * (`lib/session-signals.ts`.`parallelWorktreesMentioned`). Négation complète par
 * défaut pour la contre-preuve — suffit ici.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { parallelWorktreesMentioned } from "../../lib/session-signals.js";

const CHECK_ID = "P2.session";
const PATH_ID = "P2.p2";

const check: Check = {
  id: CHECK_ID,
  axe: "P",
  marche: "P2",
  sources: ["S"],
  pack: "core-session",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "S.parallel_worktrees_mentioned": parallelWorktreesMentioned(context.session),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "P", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
