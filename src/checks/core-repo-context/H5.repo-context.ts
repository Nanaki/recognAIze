/**
 * `H5.p1` (« guardrails », voie RC). Preuve :
 * `RC.guardrail_artifact_present === true` — présence (pas nécessairement
 * spécifique) d'un artefact catégorie `"hook"` ou `"deny-list"`
 * (`lib/repo-context-signals.ts`). `.claude/settings.json` (`permissions.deny`)
 * est classé `"deny-list"` par `sources/repo-context.ts` : sa seule présence
 * suffit à prouver `H5.p1`, conforme à la règle d'acceptation de cette marche
 * (« `settings.json` avec `permissions.deny` ⇒ H5 prouvée ») —
 * `repo-context.ts` n'expose pas le contenu brut des fichiers, donc
 * `permissions.deny` lui-même n'est jamais inspecté ; seule la classification
 * par nom/emplacement (déjà faite en amont) compte.
 *
 * Contre-preuve : négation complète par défaut — suffit ici, même raisonnement
 * que `H2.repo-context.ts`.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { guardrailArtifactPresent } from "../../lib/repo-context-signals.js";

const CHECK_ID = "H5.repo-context";
const PATH_ID = "H5.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "H",
  marche: "H5",
  sources: ["RC"],
  pack: "core-repo-context",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "RC.guardrail_artifact_present": guardrailArtifactPresent(context.repoContext),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "H", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
