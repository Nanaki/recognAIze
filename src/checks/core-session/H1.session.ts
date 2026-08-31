/**
 * Marche par défaut `H1` (axe Harness), voie session. NO-OP
 * délibéré, même schéma que `H1.default.ts` : `H1` est
 * `"default": true` avec `proof_paths: []` dans `src/referentiel.json`, aucun
 * `path_id` ne peut donc lui être rattaché, quelle que soit la source. Un
 * objectif encadré (objectif + fichiers + contrainte) reste un motif de
 * session, mais seul `I2.p2` (`S.first_prompt_framed`, voir `I2.session.ts`)
 * peut réellement porter une `Evidence`.
 */

import type { Check } from "../../core/types.js";

const check: Check = {
  id: "H1.session",
  axe: "H",
  marche: "H1",
  sources: ["S"],
  pack: "core-session",
  enabled: true,
  path_ids: [],
  run: () => [],
};

export default check;
