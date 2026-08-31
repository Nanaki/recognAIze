/**
 * `T2.p3` (« feature M », voie session). Preuve/contre-preuve
 * (force `"indice"`, figée par `referentiel.json`) :
 * `S.files_touched_single_module ≥ 3` — plus grand groupe de chemins distincts
 * partageant le même premier segment de répertoire, dans le digest
 * (`lib/session-signals.ts`.`filesTouchedSingleModuleCount`, proxy structurel :
 * `SessionDigest` n'expose pas de notion de « module » applicative). Négation
 * complète par défaut pour la contre-preuve — suffit ici.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { filesTouchedSingleModuleCount } from "../../lib/session-signals.js";

const CHECK_ID = "T2.session";
const PATH_ID = "T2.p3";

const check: Check = {
  id: CHECK_ID,
  axe: "T",
  marche: "T2",
  sources: ["S"],
  pack: "core-session",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "S.files_touched_single_module": filesTouchedSingleModuleCount(context.session),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "T", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
