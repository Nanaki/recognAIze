/**
 * `I5.p1` (« jamais, cadrage compris »). NO-OP délibéré, même schéma que les
 * 5 marches par défaut (`T1.default.ts` et consorts) : aucune `Evidence`
 * n'est jamais produite.
 *
 * `I5.p1` exige de savoir si une PR a été ouverte par « un compte d'agent
 * configuré dans `recognaize.config.json` » (référentiel : « sans champ
 * auteur ⇒ inconnu »). `recognaize.config.json` n'a aucun adaptateur pour ça
 * (aucun des 7 champs de `ProfileContext` ne le porte) et `PullRequestsData`
 * (`sources/pull-requests.ts`) n'expose non plus aucun champ auteur
 * (`user`/`login`/`author`). Ce signal est donc STRUCTURELLEMENT non
 * calculable ici : `path_ids: ["I5.p1"]` est déclaré pour que le registre ne
 * signale pas `I5.p1` comme orpheline, mais `run` ne produit jamais
 * d'`Evidence` — la marche reste `"inconnu"`, jamais `"infirmé"` par défaut
 * (aucun autre check ne produit de contre-preuve sur `I5`, et la règle
 * « source muette » de `core/judge.ts` ne s'applique qu'à un axe entièrement
 * sans preuve, pas à une marche isolée — `I2`/`I3`/`I4` portent déjà de
 * l'Evidence sur l'axe `I` dès qu'un profil a une trace d'usage IA).
 */

import type { Check } from "../../core/types.js";

const check: Check = {
  id: "I5.pull-requests",
  axe: "I",
  marche: "I5",
  sources: ["PR"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: ["I5.p1"],
  run: () => [],
};

export default check;
