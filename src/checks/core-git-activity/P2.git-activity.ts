/**
 * `P2.p1` (« isolation & préparation »). Preuve :
 * `median_concurrent_branches ≥ 2 OU (max_concurrent_branches ≥ 2 ET artefact
 * d'isolation)` — expression `or`/`and` du référentiel, évaluée telle quelle.
 *
 * Contre-preuve : PAS la négation complète du `or` (qui exigerait
 * `median < 2 ET (max < 2 OU pas d'isolation)`, infirmant à tort dès qu'un
 * artefact d'isolation manque même si `max ≥ 2`) — le référentiel documente une
 * règle plus étroite (`P2.counter_proof.signal_id = "GA.max_concurrent_branches"`,
 * description « GA max < 2 »). Ce check retrouve donc, parmi les feuilles de
 * l'expression déjà évaluée, celle dont le `signal_id` correspond exactement au
 * `signal_id` de contre-preuve déclaré par la marche, et n'utilise QUE son
 * verdict individuel — jamais celui du `or` entier. Avec `max ≥ 2` mais
 * isolation inconnue, la feuille `max_concurrent_branches` est vraie : aucune
 * contre-preuve n'est émise, la marche reste `"inconnu"` (comportement attendu :
 * `median=1, max=2, pas d'artefact d'isolation observable ⇒ P2 inconnue`).
 *
 * `repo-context.ts` classe les artefacts en 9 catégories connues — aucune
 * n'est dédiée à l'« isolation » (worktrees, sessions parallèles). Il
 * n'expose pas non plus le contenu brut des fichiers en aval
 * (`RepoContextArtifact` n'a pas de champ `content`) — seule une détection
 * par NOM de fichier est possible ici : `relPath` contenant `worktree`
 * (insensible à la casse), ex. `.worktreeinclude`. `ctx.repoContext` absent
 * ⇒ signal `undefined` (jamais regardé) ; présent mais sans artefact
 * correspondant ⇒ `false` (regardé, rien trouvé) — jamais l'inverse.
 */

import type { Check, ProfileContext } from "../../core/types.js";
import { thresholdFor } from "../../core/referentiel.js";
import { buildEvidence, evaluateExpr, formatExprCitation, type SignalValue } from "../../lib/threshold-eval.js";

const CHECK_ID = "P2.git-activity";
const PATH_ID = "P2.p1";
const COUNTER_PROOF_SIGNAL_ID = "GA.max_concurrent_branches";
const ISOLATION_ARTIFACT_PATTERN = /worktree/i;

function isolationArtifactPresent(context: ProfileContext): SignalValue {
  const artifacts = context.repoContext?.artifacts;
  if (artifacts === undefined) {
    return undefined;
  }
  return artifacts.some((artifact) => ISOLATION_ARTIFACT_PATTERN.test(artifact.relPath));
}

const check: Check = {
  id: CHECK_ID,
  axe: "P",
  marche: "P2",
  sources: ["GA", "RC"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "GA.median_concurrent_branches": context.gitActivity?.parallelism?.median_concurrent_branches,
      "GA.max_concurrent_branches": context.gitActivity?.parallelism?.max_concurrent_branches,
      "RC.isolation_artifact_present": isolationArtifactPresent(context),
    };
    const proofEval = evaluateExpr(thresholdFor(referentiel, PATH_ID), signals);

    if (proofEval.result === "true") {
      return [
        buildEvidence({
          referentiel,
          checkId: CHECK_ID,
          pathId: PATH_ID,
          axe: "P",
          polarite: "preuve",
          citation: formatExprCitation(proofEval),
          valueType: "count",
          unit: "branches",
        }),
      ];
    }

    const counterLeaf = proofEval.conditions.find((condition) => condition.signal_id === COUNTER_PROOF_SIGNAL_ID);
    if (counterLeaf?.result === "false") {
      return [
        buildEvidence({
          referentiel,
          checkId: CHECK_ID,
          pathId: PATH_ID,
          axe: "P",
          polarite: "contre-preuve",
          citation: `GA.max_concurrent_branches=${String(counterLeaf.observed)} < 2`,
          valueType: "count",
          unit: "branches",
        }),
      ];
    }

    return [];
  },
};

export default check;
