/**
 * Marche par défaut `O1` (axe Ownership, affiché, hors ligne de montée).
 * NO-OP délibéré, même raisonnement que `T1.default.ts` : `O1` est
 * `"default": true` avec `proof_paths: []` dans `src/referentiel.json`, aucun
 * `path_id` ne peut donc lui être rattaché. Le juge (`core/judge.ts`.`computeAxis`,
 * branche Ownership) sème `O1` à `"prouvé"` dès que `hasAiUsageProof`
 * (`src/lib/ai-usage-proof.ts`) est vrai ET qu'au moins une source de référence
 * de l'axe Ownership est présente (`applyDefaultSeed`) — jamais de rabais
 * Ownership sur un profil où Ownership n'a même pas été regardé — sans
 * Evidence.
 */

import type { Check } from "../../core/types.js";

const check: Check = {
  id: "O1.default",
  axe: "O",
  marche: "O1",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [],
  run: () => [],
};

export default check;
