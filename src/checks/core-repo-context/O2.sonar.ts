/**
 * Badge qualité Sonar. NO-OP délibéré côté registre :
 * `path_ids: []`, `run` ne produit jamais d'`Evidence` — même schéma que les
 * marches par défaut (`T1.default.ts` et consorts), pour une raison
 * différente : ce n'est pas `O2` qui manque de `proof_paths` (`O2.p1` est
 * déjà couvert par `O2.git-activity.ts`, `O2.p3` par `O2.session.ts`) — c'est
 * le badge lui-même qui doit structurellement ne JAMAIS produire d'`Evidence` :
 * ce calcul ne doit jamais entrer dans un rang/niveau/fourchette.
 *
 * Le calcul réel vit entièrement dans `lib/quality-badge.ts`
 * (`computeQualityBadge`), pur, testé directement (`test/lib/quality-badge.test.ts`)
 * et consommé par le rapport directement depuis `lib/`, jamais via le
 * registre de checks. Le déclarer ici (fichier `<marche>.<source>.ts`, pack
 * `core-repo-context`) sert uniquement l'inventaire du registre
 * (`recognaize checks list`) et la convention de nommage, comme les fichiers
 * `.default.ts`.
 */

import type { Check } from "../../core/types.js";

const check: Check = {
  id: "O2.sonar",
  axe: "O",
  marche: "O2",
  sources: ["SO"],
  pack: "core-repo-context",
  enabled: true,
  path_ids: [],
  run: () => [],
};

export default check;
