/**
 * Marche par défaut `O1` (axe Ownership, affiché), voie session. NO-OP
 * délibéré, même schéma que `O1.default.ts` :
 * `O1` est `"default": true` avec `proof_paths: []`, aucun `path_id` ne peut
 * donc lui être rattaché. Un motif de session du type « "montre-moi"/"juste ce
 * test" » reste associé à `O1`, mais `O1` ne peut structurellement porter
 * aucune `Evidence`.
 */

import type { Check } from "../../core/types.js";

const check: Check = {
  id: "O1.session",
  axe: "O",
  marche: "O1",
  sources: ["S"],
  pack: "core-session",
  enabled: true,
  path_ids: [],
  run: () => [],
};

export default check;
