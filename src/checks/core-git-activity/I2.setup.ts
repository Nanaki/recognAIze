/**
 * `I2.p3` (« SU : skill/agent spécifique cadrant l'autonomie ») — indice
 * faible sur le contenu déclaré du setup (skill/agent du repo-context), même
 * logique que `T2.setup.ts` : un skill qui définit des critères d'arrêt, des
 * jalons ou une exécution sans validation intermédiaire est un indice FAIBLE
 * que le dev cadre ses interventions, jamais une preuve qu'il le fait
 * réellement (voir `S.first_prompt_framed`/`S.milestone_framing_present`, qui
 * restent les seules preuves d'un cadrage RÉELLEMENT observé en session).
 *
 * NO-OP délibéré dans le CLI déterministe, même limite que `T2.setup.ts` :
 * `SU.autonomous_framing_setup_present` exige de lire le contenu textuel d'un
 * artefact skill/agent, jamais retenu par `RepoContextArtifact` après
 * classification. Signal structurellement non calculable par le chemin
 * déterministe ; seul le chemin agentique peut le peupler. Ce check existe
 * uniquement pour que `I2.p3` ait un `path_id` non-orphelin et apparaisse
 * dans le registre/l'explicabilité — son `run` ne produit jamais
 * d'`Evidence`, par construction.
 */

import type { Check } from "../../core/types.js";

const check: Check = {
  id: "I2.setup",
  axe: "I",
  marche: "I2",
  sources: ["SU"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: ["I2.p3"],
  run: () => [],
};

export default check;
