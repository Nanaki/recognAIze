/**
 * `O5.p1` (« gouverne l'autonomie »). Seule voie de preuve
 * déclarée par le référentiel pour cette marche (1 seul `proof_path`). Preuve :
 * `RC.evals_versioned_present ET RC.trust_tier_or_circuit_breaker_present`
 * (`lib/repo-context-signals.ts`) — motif de nom de fichier (`eval`,
 * `trust-tier`/`trust_tier`, `circuit-breaker`/`circuit_breaker`), TOUTE
 * catégorie confondue y compris `"capitalisation"` (`O5` est un axe Ownership,
 * pas `H` — contrairement à `H7`, qui exclut cette catégorie).
 *
 * Contre-preuve : négation complète par défaut — suffit ici, donne exactement
 * « RC fourni sans evals », la contre-preuve documentée par `referentiel.json`.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { evalsVersionedPresent, trustTierOrCircuitBreakerPresent } from "../../lib/repo-context-signals.js";

const CHECK_ID = "O5.repo-context";
const PATH_ID = "O5.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "O",
  marche: "O5",
  sources: ["RC"],
  pack: "core-repo-context",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "RC.evals_versioned_present": evalsVersionedPresent(context.repoContext),
      "RC.trust_tier_or_circuit_breaker_present": trustTierOrCircuitBreakerPresent(context.repoContext),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "O", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
