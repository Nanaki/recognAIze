/**
 * Approximation locale de « `last_updated` dans la fenêtre d'analyse », pour
 * `H3.git-activity.ts`.
 *
 * `Check.run` (`core/types.ts`) ne reçoit que `ProfileContext` et
 * `Referentiel` — jamais l'`AsOfWindow` résolue par `src/analyze.ts` (qui, elle,
 * peut aussi dépendre de `--as-of`, non présent dans `ProfileContext`). Un check
 * ne peut donc reconstruire la fenêtre exacte de l'exécution — il la RE-DÉRIVE
 * localement, à partir de la SEULE source qu'il peut lire lui-même :
 * `git-activity.json`.`period`. `core/as-of.ts`.`deriveAsOf` est appelé ici sans
 * `contextFilesLastUpdated` (l'utiliser comme source de la fenêtre alors qu'on
 * teste précisément CE champ contre la fenêtre serait circulaire — la fenêtre
 * finirait toujours par se terminer exactement à `last_updated`) ni
 * `explicitAsOf` (inaccessible). Ce module reproduit donc exactement la même
 * fenêtre que `src/analyze.ts` tant qu'aucun `--as-of` explicite n'est passé —
 * seul cas de divergence possible.
 *
 * La validation de forme ISO (`ISO_DAY_PREFIX_RE`) est nécessaire en plus du
 * simple test de longueur : `day.length < 10` seul laisserait passer toute
 * chaîne non-ISO de ≥10 caractères (ex. `"pas une date"` tronquée à
 * `"pas une da"`, comparée lexicographiquement aux bornes de fenêtre —
 * silencieusement `false` plutôt qu'`undefined`). `H3.repo-context.ts` a besoin
 * de cette distinction pour son propre critère d'acceptation (« `last_updated`
 * non ISO ⇒ H3 **inconnue**, jamais infirmée ») : toute date réellement ISO
 * (`YYYY-MM-DD…`) se comporte normalement ; seules les chaînes qui ne seraient
 * de toute façon que de faux positifs lexicographiques basculent vers
 * `undefined` plutôt que `false`.
 */

import { deriveAsOf } from "../core/as-of.js";
import type { GitActivityPeriod } from "../sources/git-activity.js";

const ISO_DAY_PREFIX_RE = /^\d{4}-\d{2}-\d{2}/;

export function isAgentsMdMaintainedInWindow(
  period: GitActivityPeriod | undefined,
  lastUpdated: string | null | undefined,
): boolean | undefined {
  if (lastUpdated === null || lastUpdated === undefined) {
    return undefined;
  }
  const asOf = deriveAsOf({ period });
  if (asOf.status !== "ok") {
    return undefined;
  }
  const day = lastUpdated.slice(0, 10); // anti-littéral-lib: longueur d'un préfixe de date ISO "YYYY-MM-DD" (constante structurelle de format, jamais un seuil métier consommé par un check).
  if (day.length < 10 || !ISO_DAY_PREFIX_RE.test(day)) { // anti-littéral-lib: même constante de longueur ISO que ci-dessus.
    return undefined;
  }
  return day >= asOf.data.window.from && day <= asOf.data.window.to;
}
