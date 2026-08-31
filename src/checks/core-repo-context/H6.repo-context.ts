/**
 * `H6.p1` (« boucles — artefact exécutable », voie RC).
 * Preuve : `RC.loop_artifact_executable === true` — artefact catégorie
 * `"hook"` ET spécifique (`lib/repo-context-signals.ts`). Être classé
 * `"hook"` seul ne suffit pas : la marche exige en plus que l'artefact soit
 * spécifique (nommé, pas générique).
 *
 * Règle centrale de cette marche (« Neutralité d'outil » : « un document ou
 * un plan ne prouve jamais une capacité d'exécution ») : un fichier de PROSE
 * décrivant une boucle jamais outillée ne peut structurellement jamais
 * satisfaire ce signal — `sources/repo-context.ts` ne classe QUE 9 catégories
 * connues à des emplacements connus (`KNOWN_NESTED_DIRS`), aucune catégorie
 * « CI workflow »/« script » dédiée, et `docs/brainstorm/` (emplacement
 * typique d'un tel document) n'y figure PAS : ce dossier n'est jamais
 * inventorié, son contenu n'apparaît donc JAMAIS comme artefact `"hook"` — un
 * document décrivant une boucle est donc infirmé (ou laissé inconnu si `RC` n'a
 * par ailleurs aucun artefact) par construction, jamais prouvé, sans qu'aucune
 * lecture de contenu ne soit nécessaire ni possible ici (`RepoContextArtifact`
 * n'expose pas `content`).
 *
 * Contre-preuve : négation complète par défaut — suffit ici (RC fourni sans
 * artefact exécutable), même raisonnement que `H2.repo-context.ts`.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { loopArtifactExecutable } from "../../lib/repo-context-signals.js";

const CHECK_ID = "H6.repo-context";
const PATH_ID = "H6.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "H",
  marche: "H6",
  sources: ["RC"],
  pack: "core-repo-context",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "RC.loop_artifact_executable": loopArtifactExecutable(context.repoContext),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "H", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
