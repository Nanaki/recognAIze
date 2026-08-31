/**
 * `T4.p1` (« XL master plan »). Preuve : `GA.xl_ratio ≥ 20 %`
 * (`evaluateExpr` sur `thresholdFor("T4.p1")`). Contre-preuve : PAS la négation
 * complète (`xl_ratio < 20 %` inclurait par exemple 1 PR XL sur 10, soit 10 %) —
 * le référentiel documente littéralement « aucune PR XL » (`T4.counter_proof`),
 * une condition strictement plus forte. Ce check construit donc directement son
 * `Evidence` avec `buildEvidence` plutôt que `evaluateProofPathDefault`, en
 * testant `size_distribution.xl === 0` (0 est le seul littéral toléré par
 * `evals/anti-literal.ts`, où qu'il apparaisse dans `src/checks/**`).
 *
 * `xl_ratio` n'est pas un champ direct de `git-activity.json` — calculé ici comme
 * `size_distribution.xl / pull_requests.total`, seulement quand `total > 0`
 * (jamais de division par zéro, `.claude/rules/fiabilite.md`).
 */

import type { Check } from "../../core/types.js";
import { thresholdFor } from "../../core/referentiel.js";
import { buildEvidence, evaluateExpr, formatExprCitation, type SignalValue } from "../../lib/threshold-eval.js";

const CHECK_ID = "T4.git-activity";
const PATH_ID = "T4.p1";

const check: Check = {
  id: CHECK_ID,
  axe: "T",
  marche: "T4",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const pullRequests = context.gitActivity?.pull_requests;
    const total = pullRequests?.total;
    const xlCount = pullRequests?.size_distribution?.xl;
    if (total === undefined || total <= 0 || xlCount === undefined) {
      return [];
    }
    const xlRatio: SignalValue = xlCount / total;

    const proofEval = evaluateExpr(thresholdFor(referentiel, PATH_ID), { "GA.xl_ratio": xlRatio });
    if (proofEval.result === "true") {
      return [
        buildEvidence({
          referentiel,
          checkId: CHECK_ID,
          pathId: PATH_ID,
          axe: "T",
          polarite: "preuve",
          citation: formatExprCitation(proofEval),
          valueType: "ratio",
          unit: "ratio",
        }),
      ];
    }

    if (xlCount === 0) {
      return [
        buildEvidence({
          referentiel,
          checkId: CHECK_ID,
          pathId: PATH_ID,
          axe: "T",
          polarite: "contre-preuve",
          citation: `GA.xl_count=${xlCount} (aucune PR XL sur ${total})`,
          valueType: "count",
          unit: "PR",
        }),
      ];
    }

    return [];
  },
};

export default check;
