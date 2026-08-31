/**
 * `O3.p2` (« comprend et capitalise », voie PR). Preuve :
 * `structured_body_ratio ≥ 0,5`. Contre-preuve : négation complète (`< 0,5`) —
 * le référentiel documente une contre-preuve plus large pour la marche
 * (« RC fourni sans artefact et aucun body structuré »), mais celle-ci ne peut
 * être établie QUE conjointement avec `O3.p1` (`RC`, hors périmètre ici) — ce
 * check-ci ne parle que de son propre chemin de preuve `O3.p2`, sa négation
 * complète (bodies non nuls majoritairement non structurés) reste une
 * contre-preuve valide et suffisante pour CE path_id.
 *
 * `PR.structured_body_ratio` est calculé par `sources/pull-requests.ts` — ce
 * check ne fait que le comparer au seuil.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";

const CHECK_ID = "O3.pull-requests";
const PATH_ID = "O3.p2";

const check: Check = {
  id: CHECK_ID,
  axe: "O",
  marche: "O3",
  sources: ["PR"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const ratio = context.pullRequests?.structuredBodyRatio;
    const signals: Record<string, SignalValue> = {
      "PR.structured_body_ratio": ratio !== undefined && ratio.status === "ok" ? ratio.value : undefined,
    };
    const evidence = evaluateProofPathDefault({
      referentiel,
      checkId: CHECK_ID,
      pathId: PATH_ID,
      axe: "O",
      signals,
    });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
