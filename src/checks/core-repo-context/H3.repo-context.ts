/**
 * `H3.p1` (« mémoire vivante », voie RC). Preuve :
 * `RC.memory_files_specific_count ≥ 2 ET RC.memory_files_alive === true`.
 *
 * `memory_files_specific_count` vient de `lib/repo-context-signals.ts`
 * (catégorie `"memoire"`, spécifiques). `memory_files_alive` est calculé ICI,
 * PAS via les `usageHints` déjà posés par `sources/repo-context.ts` sur chaque
 * artefact (`"modified_in_window"`) : ce booléen-là coerce déjà silencieusement
 * une date manquante/non ISO en `false` (`isModifiedInWindow`, `repo-context.ts`),
 * ce qui romprait la règle du critère d'acceptation de cette marche (« `last_updated`
 * `null`/non ISO ⇒ H3 **inconnue**, jamais infirmée »). `lib/agents-md-window.ts`
 * donne exactement le tri-state correct
 * (`undefined` si absent/non ISO, booléen sinon) — cohérent avec le fait que
 * `RepoContextArtifact` n'a pas de mtime par fichier : `GA.context_files.last_updated`
 * EST le seul horodatage disponible, commun à tous les artefacts (`repo-context.ts`,
 * doc de tête, § `RepoContextOptions.contextFilesLastUpdated`).
 *
 * Contre-preuve : négation complète par défaut — suffit ici (voir
 * `lib/repo-context-signals.ts`, tête de fichier) : `count < 2` OU `alive ===
 * false` avec `RC` fourni donne exactement « RC fourni sans mémoire ; last_updated
 * hors fenêtre », la contre-preuve documentée par `referentiel.json`. Si `count
 * ≥ 2` mais `alive` inconnue (date manquante/non ISO), l'expression `and` reste
 * `"unknown"` (jamais `"false"`) : ni preuve, ni contre-preuve.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { memoryFilesSpecificCount } from "../../lib/repo-context-signals.js";
import { isAgentsMdMaintainedInWindow } from "../../lib/agents-md-window.js";

const CHECK_ID = "H3.repo-context";
const PATH_ID = "H3.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "H",
  marche: "H3",
  sources: ["RC", "GA"],
  pack: "core-repo-context",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "RC.memory_files_specific_count": memoryFilesSpecificCount(context.repoContext),
      "RC.memory_files_alive": isAgentsMdMaintainedInWindow(
        context.gitActivity?.period,
        context.gitActivity?.context_files?.last_updated,
      ),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "H", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
