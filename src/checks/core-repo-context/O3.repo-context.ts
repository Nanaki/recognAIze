/**
 * `O3.p1` (« comprend et capitalise », voie RC). Preuve :
 * `RC.capitalization_artifact_specific_count ≥ 1` — catégorie `"capitalisation"`
 * spécifique (`lib/repo-context-signals.ts`) : `aidd_docs/tasks`,
 * `docs/decisions`, `docs/adr`, `docs/specs`, `docs/plans`
 * (`sources/repo-context.ts` — déjà sa propre catégorie, pas de classification
 * à dupliquer ici). `O3` est un axe Ownership, PAS `H` : ces dossiers y
 * comptent légitimement (contrairement à `H2`-`H7`, qui les excluent
 * explicitement — voir `lib/repo-context-signals.ts`, tête de fichier).
 *
 * Contre-preuve : négation complète par défaut — suffit ici pour CE chemin de
 * preuve (`O3.p1`) ; le référentiel documente une contre-preuve de marche plus
 * large (« RC fourni sans artefact ET aucun body structuré »), mais celle-ci ne
 * peut être établie QUE conjointement avec `O3.p2` (`PR`) — même raisonnement
 * que documenté dans `O3.pull-requests.ts`.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { capitalizationArtifactSpecificCount } from "../../lib/repo-context-signals.js";

const CHECK_ID = "O3.repo-context";
const PATH_ID = "O3.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "O",
  marche: "O3",
  sources: ["RC"],
  pack: "core-repo-context",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "RC.capitalization_artifact_specific_count": capitalizationArtifactSpecificCount(context.repoContext),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "O", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
