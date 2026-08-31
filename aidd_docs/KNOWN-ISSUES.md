# Known issues — revue finale avant rendu (2026-08-31)

Résultat de la revue finale (`/code-review high`, PR #1 `feat/mvp-chemin-jury` →
`main`, 8 angles de recherche, 10 candidats, 10/10 confirmés en vérification
indépendante). Aucun ne viole une règle dure de `.claude/rules/fiabilite.md`
ou `CLAUDE.md` — la CI (4 jambes + secrets), `npm test` (1379 tests) et
`npm run eval` (4/4 rang exact) restent verts. Deux corrigés immédiatement
(sûrs, dans du code déjà touché cette session) ; le reste est du tech-debt
pré-existant, documenté ici plutôt que corrigé en urgence juste avant un
rendu à échéance fixe — à traiter sur `next`.

## Corrigés avant le tag `v1.0.0-rendu`

1. **`scripts/agentic/judge-from-signals.ts`** — `bySource` (dans
   `referenceSourcesPresentesFrom`) omettait la clé `"SU"` du type `SourceId`
   (7 membres) : une vraie erreur TypeScript, invisible car `scripts/**`
   n'était inclus dans aucun `tsconfig` couvert par `npm run typecheck`.
   Corrigé (clé ajoutée) ; `tsconfig.test.json` inclut maintenant
   `scripts/**/*.ts` — le gate `typecheck` couvre désormais tout le chemin
   agentique, plus de zone aveugle.

## À traiter sur `next`

Par ordre de sévérité (le plus important d'abord) :

2. **`src/checks/core-git-activity/I4.pull-requests.ts:32` et
   `I4.git-activity.ts:43`** — le ratio `GA.merged_without_human_edit_ratio`
   divise un numérateur (`git-activity.json`) par un dénominateur
   indépendant (`pull-requests.json`, ou `pull_requests.total`) sans borne
   `numérateur ≤ dénominateur`. Une incohérence entre les deux fichiers
   produirait un ratio > 1 accepté tel quel par le comparateur `gte 0.8`,
   prouvant I4 sur une valeur impossible plutôt que de retomber sur
   `inconnu`. Fix suggéré : borner ou rejeter (`inconnu` explicite) tout
   ratio hors `[0;1]`, avec un test dédié.
3. **`src/cli.ts`** — `checks explain` appelle `runAnalysis(...,
   { includeExperimentalLlm: true })` alors qu'`analyze` fixe toujours
   `false` ; contredit l'invariant documenté dans `analyze.ts`. Inerte tant
   que `experimental-llm` reste un pack vide, mais à corriger avant d'y
   ajouter un check.
4. **`src/core/referentiel.ts:195`** — la validation des chemins de preuve
   au chargement du référentiel saute les 5 marches par défaut
   (`DEFAULT_MARCHE_IDS`). Dormant (aucune n'a de `proof_paths` aujourd'hui),
   mais un futur `path_id` mal orthographié sur une marche par défaut ne
   ferait pas échouer le démarrage comme pour toute autre marche.
5. **`scripts/agentic/judge-from-signals.ts:66`** —
   `hasAiUsageProofFromSignals` duplique à la main la porte OR à 4
   conditions de `src/lib/ai-usage-proof.ts` (et sa docstring dit « 5
   signaux » alors qu'il n'y en a que 4). Si la porte White/Red change côté
   déterministe, le pont agentique ne suit pas automatiquement — risque de
   dérive contre la calibration « match exact » revendiquée. Aucun test ne
   nomme cette fonction.
6. **`scripts/agentic/judge-from-signals.ts:79`** —
   `NEVER_COUNTER_PROOF_PATH_IDS` ne couvre que `T2.p2`/`T3.p2` (+ le cas
   `T4.p1`) alors que la docstring du fichier reconnaît la même asymétrie de
   négation sur H2-H5 et P2, non patchée. Déjà documenté comme « limitation
   assumée », pas une régression silencieuse — mais la liste reste
   manuelle et incomplète.
7. **`src/core/judge.ts` / `report/html.ts` / `core/types.ts` /
   `core/referentiel.ts` / `report/export-input.ts`** — l'axe Ownership (5ᵉ
   axe, non bloquant) et la liste des 5 axes sont dupliqués à la main dans
   au moins 5 endroits (`OFFICIAL_AXES` deux fois, `AxeId`, `AXIS_IDS`,
   `z.enum([...])`). Ajouter un 6ᵉ axe demanderait de retrouver et mettre à
   jour chacun sans qu'aucun ne soit vérifié par le compilateur.
8. **`scripts/agentic/signal-contract.ts:31`** — `walkExpr()`
   réimplémente à la main la récursion sur `ThresholdExpr` que
   `src/lib/threshold-eval.ts`.`evaluateExpr()` fait déjà (et expose via son
   champ `conditions` aplati) — jamais testé directement dans `test/agentic/`.
9. **`src/checks/core-git-activity/H2.git-activity.ts` (et H3/H4/H5)** — le
   bloc de contre-preuve « context_files tout à zéro », citation comprise,
   est copié-collé à l'identique dans les 4 fichiers (seuls `valueType`/`unit`
   diffèrent) au lieu d'un helper partagé.
10. **`src/sources/read.ts:454`** — la vérification anti-symlink-sortant
    (avec le même message d'avertissement) est réimplémentée 3 fois dans ce
    fichier au lieu d'appeler `checkSymlinkSafety` (déjà extraite,
    lignes 145-163) dans les 3 cas.

Aucun de ces points ne bloque le rendu : ils sont dormants aujourd'hui,
couverts par la CI/`npm run eval` en l'état, et documentés ici pour ne pas
être perdus plutôt que corrigés dans l'urgence contre l'échéance.
