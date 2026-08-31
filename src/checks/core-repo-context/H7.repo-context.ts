/**
 * `H7.p1` (« orchestration gouvernée », voie RC). Preuve :
 * `RC.multi_agent_orchestrator_count >= 2 ET RC.evals_or_trust_tier_present`
 * (seuil déclaré dans `referentiel.json`.`thresholds["H7.p1"]`, lu par
 * `lib/threshold-eval.ts` — jamais en dur ici ni dans
 * `lib/repo-context-signals.ts`) — les DEUX conditions (« orchestrateur
 * multi-agents ET (evals OU trust tiers) ») : `multi_agent_orchestrator_count`
 * compte les artefacts catégorie `"agent"` spécifiques (proxy structurel d'un
 * orchestrateur multi-agents, `repo-context.ts` n'ayant pas de catégorie dédiée
 * à l'orchestration elle-même), comparé à `>= 2` par le référentiel ;
 * `evals_or_trust_tier_present` détecte un nom de fichier évoquant
 * `eval`/`trust-tier`/`circuit-breaker`, EXCLUANT explicitement la catégorie
 * `"capitalisation"` (ces dossiers ne comptent jamais pour l'axe H — `H7` en
 * fait partie).
 *
 * Le signal expose le COMPTE brut (`multiAgentOrchestratorCount`), jamais un
 * booléen pré-comparé : le seuil `>= 2` vit uniquement dans `referentiel.json`,
 * jamais en dur dans `lib/repo-context-signals.ts` ni ici (même schéma que
 * `H3`/`H4` avec `RC.memory_files_specific_count` /
 * `RC.behavior_artifacts_specific_count` — voir `.claude/rules/fiabilite.md` :
 * « les seuils vivent dans referentiel.json, jamais en littéraux dans les
 * checks »).
 *
 * Contre-preuve : négation complète par défaut — suffit ici (RC fourni sans
 * orchestrateur), même raisonnement que `H2.repo-context.ts`. `H7.session.ts`
 * couvre la voie `S` (indice seulement) de la même marche.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { evalsOrTrustTierPresentForH, multiAgentOrchestratorCount } from "../../lib/repo-context-signals.js";

const CHECK_ID = "H7.repo-context";
const PATH_ID = "H7.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "H",
  marche: "H7",
  sources: ["RC"],
  pack: "core-repo-context",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "RC.multi_agent_orchestrator_count": multiAgentOrchestratorCount(context.repoContext),
      "RC.evals_or_trust_tier_present": evalsOrTrustTierPresentForH(context.repoContext),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "H", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
