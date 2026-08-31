/**
 * `H2.p1` (« identité projet », voie RC). Preuve :
 * `RC.identity_file_specific === true` (`lib/repo-context-signals.ts`).
 * Contre-preuve : négation complète par défaut (`evaluateProofPathDefault`) —
 * suffit ici (chaque signal RC est self-contained à sa propre marche : la
 * négation complète de « RC.identity_file_specific » EST déjà « RC fourni
 * sans fichier d'identité », la contre-preuve documentée par
 * `referentiel.json` pour `H2` sur cette voie). `ctx.repoContext` absent ⇒
 * signal `undefined` (jamais regardé) ; présent sans fichier d'identité
 * spécifique ⇒ `false` (regardé, rien trouvé) — jamais l'inverse.
 * `H2.git-activity.ts` couvre la voie GA (`H2.p2`) de la même marche ; en cas
 * de contradiction entre les deux (ex. `RC` prouve, `GA.agents_md`
 * absent/faux), `core/judge.ts` tranche par précédence de source (`RC > GA`).
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { identityFileSpecific } from "../../lib/repo-context-signals.js";

const CHECK_ID = "H2.repo-context";
const PATH_ID = "H2.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "H",
  marche: "H2",
  sources: ["RC"],
  pack: "core-repo-context",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "RC.identity_file_specific": identityFileSpecific(context.repoContext),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "H", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
