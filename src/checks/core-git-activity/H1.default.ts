/**
 * Marche par défaut `H1` (« prompts structurés », axe Harness). NO-OP
 * délibéré, même raisonnement que `T1.default.ts` : `H1` est
 * `"default": true` avec `proof_paths: []` dans `src/referentiel.json`,
 * aucun `path_id` ne peut donc lui être rattaché. Le juge
 * (`core/judge.ts`.`computeAxis`) sème `H1` à `"prouvé"` dès que
 * `hasAiUsageProof` (`src/lib/ai-usage-proof.ts`) est vrai, sans Evidence.
 */

import type { Check } from "../../core/types.js";

const check: Check = {
  id: "H1.default",
  axe: "H",
  marche: "H1",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [],
  run: () => [],
};

export default check;
