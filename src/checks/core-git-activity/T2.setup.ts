/**
 * `T2.p4` (« SU : skill/agent spécifique orienté taille ») — indice faible sur
 * le contenu déclaré du setup (skill/agent du repo-context), demandé pour
 * distinguer « le dev a de la tooling » (axe H) de « la tooling évoque une
 * taille de tâche cohérente avec T2/T3 » (indice faible sur T lui-même).
 *
 * NO-OP délibéré dans le CLI déterministe, jamais un oubli.
 * `SU.size_oriented_setup_present` exige de LIRE le contenu textuel d'un
 * artefact skill/agent (mots-clés multi-fichiers/migration/plusieurs couches)
 * — or `RepoContextArtifact` (`sources/repo-context.ts`) NE RETIENT PAS le
 * texte brut après classification (même limite pour `P2`/`O5`/`H7` : contenu
 * jeté après calcul des hints). Ce signal reste donc STRUCTURELLEMENT non
 * calculable par le chemin déterministe — seul le chemin agentique
 * (sous-agent LLM lisant les fichiers bruts sans cette contrainte) peut le
 * peupler. Ce check existe uniquement pour que `T2.p4` ait un `path_id`
 * non-orphelin (`core/registry.ts`.`buildRegistry` l'exige) et apparaisse
 * dans `recognaize checks list`/l'explicabilité — son `run` ne produit jamais
 * d'`Evidence`, par construction, jamais par oubli.
 */

import type { Check } from "../../core/types.js";

const check: Check = {
  id: "T2.setup",
  axe: "T",
  marche: "T2",
  sources: ["SU"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: ["T2.p4"],
  run: () => [],
};

export default check;
