/**
 * `H4.p1` (« comportements versionnés », voie RC). Preuve :
 * `RC.behavior_artifacts_specific_count ≥ 1` (règle/skill/agent, + `prompt` en
 * approximation de « commande » — voir la tête de
 * `lib/repo-context-signals.ts`). Contre-preuve : négation complète par défaut
 * (suffit ici, même raisonnement que `H2.repo-context.ts`).
 *
 * `H4.git-activity.ts` couvre la voie GA (`H4.p2`) de la même marche,
 * silencieuse sauf si `GA.context_files` est ENTIÈREMENT à zéro. La règle
 * d'acceptation de cette marche (« 0 règle mais 4 skills et 2 agents ⇒ H4
 * prouvée ; infirmée SEULEMENT si compteurs à zéro ET aucun artefact ») est
 * satisfaite par construction sans aucune règle jointe entre les deux checks : si
 * `RC` trouve un artefact spécifique, ce check-ci prouve `H4.p1` — en cas de
 * contradiction avec une éventuelle contre-preuve GA, `core/judge.ts` tranche
 * par précédence `RC > GA` et la marche reste prouvée ; si `RC` NE trouve rien
 * ET que `GA` est entièrement à zéro, les deux contre-preuves concordent et la
 * marche est infirmée — exactement la conjonction visée, obtenue sans qu'aucun
 * des deux checks n'ait besoin de lire l'autre source.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { behaviorArtifactsSpecificCount } from "../../lib/repo-context-signals.js";

const CHECK_ID = "H4.repo-context";
const PATH_ID = "H4.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "H",
  marche: "H4",
  sources: ["RC"],
  pack: "core-repo-context",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "RC.behavior_artifacts_specific_count": behaviorArtifactsSpecificCount(context.repoContext),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "H", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
