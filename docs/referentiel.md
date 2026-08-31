# Référentiel — 24 marches, 5 axes

Ce document est généré à partir de la source de vérité `src/referentiel.json`
(seuils, chemins de preuve, contre-preuves) et vérifié mot pour mot contre la
sortie réelle de `node dist/cli.js checks explain <marche>` sur le binaire
construit — jamais transcrit de mémoire. Toute modification d'un seuil ou
d'une marche doit être répercutée ici après re-génération.

Chaque marche a un ancrage `#<id-minuscule>` (ex. `#t2`), généré automatiquement
par GitHub à partir du titre `## T2` — c'est le format que consomme
`src/referentiel/concepts.json` pour ses liens `docs/referentiel.md#t2`.

## Sources et `confiance_source`

Chaque preuve (`Evidence`) vient d'une source, avec un poids figé dans
`referentiel.json` :

| Source | Fichier lu | `confiance_source` |
| --- | --- | --- |
| `GA` | `git-activity.json` | 1.0 |
| `RC` | `repo-context/` (inventaire tool-agnostique) | 1.0 |
| `PR` | `pull-requests.json` | 0.9 |
| `SO` | mesures Sonar | 0.8 |
| `S` | `session.md` (digest narratif) | 0.6 |
| `SU` | `repo-context/` — contenu déclaré d'un skill/agent spécifique | 0.3 — indice FAIBLE, jamais une preuve ; positionnée sous `GA`/`PR`/`S` pour ne jamais écraser une preuve de comportement observé (voir § Source SU) |
| `DEC` | `declaratif.md` (miroir déclaré/observé) | 0 — ne prouve ni n'infirme jamais une marche seul (DEC-004) |

### Source `SU` (« Setup »)

Contrairement à `RC` (qui classe la présence/spécificité d'un artefact du
repo-context sans jamais en lire le contenu), `SU` porte sur le CONTENU
déclaré d'un skill/agent spécifique — mais reste structurellement hors de
portée du CLI déterministe : `RepoContextArtifact` (`sources/repo-context.ts`,
figé) ne retient jamais le texte brut après classification. `T2.p4`/`I2.p3`
sont donc des NO-OP délibérés dans ce binaire (`T2.setup.ts`/`I2.setup.ts`) —
seul le second outil, agentique (`scripts/agentic/`, sous-agents Claude Code
lisant les fichiers bruts sans cette contrainte), peut produire une `Evidence`
sur ces deux chemins. Détail : `README.md` § Second outil, agentique.

Une preuve a aussi une **force** : `prouve` (trace récurrente) ou `indice`
(observation isolée, jamais suffisante seule pour faire passer une marche à
l'état `prouvé`). Une **contre-preuve**, quand elle existe, infirme la marche
si son signal la contredit — l'état `infirmé` prime sur tous les autres.

## Précédence des sources (`source_precedence`)

**Un concept DIFFÉRENT de `confiance_source` ci-dessus, à ne pas confondre** —
les deux vivent dans un seul champ chacun de `referentiel.json` (schéma Zod
strict, `source_precedence` validé comme permutation exacte des `SourceId`),
lu tel quel par `core/judge.ts` et `report/explain.ts` :

| Champ | Sert à | Ordre |
| --- | --- | --- |
| `confiance_source` | Poids numérique par source, utilisé dans le calcul de la confiance globale | `GA`/`RC` (1.0) > `PR` (0.9) > `SO` (0.8) > `S` (0.6) > `SU` (0.3) > `DEC` (0) |
| `source_precedence` | Quelle source « gagne » quand deux sources se contredisent sur la même marche (`core/judge.ts`.`resolveMarcheEtat`) — aussi utilisé pour choisir une citation déterministe (`Verdict.raison`) | `RC` > `PR` > `GA` > `SO` > `S` > `SU` > `DEC` |

Les deux ordres NE coïncident PAS terme à terme (`PR` devant `GA` dans
`source_precedence`, alors que `confiance_source` donne plus de poids à `GA`)
— c'est intentionnel, pas une erreur : les deux répondent à des questions
différentes (résolution de conflit vs. pondération de confiance) et ne sont
jamais dérivés l'un de l'autre. `S` et `SU` sont placées dans cet ordre selon
`confiance_source` seulement comme heuristique de PLACEMENT — `SU` en
particulier est délibérément positionnée sous `GA`/`PR`/`S` : un artefact de
setup (skill/agent spécifique, jamais une observation de comportement réel)
ne doit jamais écraser par précédence une preuve/contre-preuve réellement
observée.

Les deux champs vivent dans `referentiel.json`, jamais en littéral dans le
code (`.claude/rules/fiabilite.md`) — `core/judge.ts` et `report/explain.ts`
lisent tous les deux `referentiel.source_precedence`, un seul endroit à
maintenir.

## Ligne de montée (`ladder`)

Seuls les axes T, H, I, P participent à la ligne de montée officielle ;
Ownership (axe O) est calculé et affiché mais n'est jamais décisif pour le
rang de base (DEC-003, voir `METHOD.md`).

| Rang | Marches requises |
| --- | --- |
| Red | T1, H1, I1, P1 |
| Blue | T2, H2, H3, I2 |
| Green | T3, H4, I3 |
| Copper | P2, P3 |
| Silver | H5, H6, I4 |
| Gold | H7, I5 |

`T4`, `O5` restent hors de la ligne de montée : ce sont des marches de
confirmation, détectées de façon grossière ou laissées `inconnu`, jamais un
critère de passage de rang (voir le README, section « hors périmètre »).

---

## Axe T — Taille

*La taille habituelle des features livrées avec l'IA (source de référence : `GA`, `PR`).*

### T1

**Tâche S** — rang Red. Marche par défaut : aucun chemin de preuve propre,
prouvée dès qu'une preuve d'usage de l'IA existe ailleurs dans le profil.

### T2

**Feature M** — rang Blue.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `T2.p1` | prouve | `GA` | `GA.size_median` | `GA.size_median ≥ M taille_bucket` |
| `T2.p2` | prouve | `PR` | `PR.median_files_or_lines_changed` | `(5 ≤ fichiers ≤ 12) OU (150 ≤ lignes ≤ 500)` |
| `T2.p3` | indice | `S` | `S.files_touched_single_module` | `S.files_touched_single_module ≥ 3 fichiers` |
| `T2.p4` | indice | `SU` | `SU.size_oriented_setup_present` | `= true` (skill/agent spécifique du repo-context orienté taille/portée — jamais une preuve, voir § Source SU) |

Contre-preuve : `GA`/`PR` médiane ≤ taille S (signal `GA.size_median`).

### T3

**Feature L planifiée** — rang Green.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `T3.p1` | prouve | `GA` | `GA.size_median` | `GA.size_median ≥ L taille_bucket` |
| `T3.p2` | prouve | `PR` | `PR.median_files_or_layers_changed` | `(fichiers > 12) OU (couches ≥ 2)` |
| `T3.p3` | indice | `S` | `S.phased_plan_multi_layer` | `S.has_phased_plan = true ET S.layers_touched ≥ 2` |

Contre-preuve : `GA`/`PR` médiane ≤ M (signal `GA.size_median`).

### T4

**XL master plan** — hors ligne de montée (confirmation grossière, non-goal assumé).

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `T4.p1` | prouve | `GA` | `GA.xl_ratio` | `GA.xl_ratio ≥ 0.2 ratio` |

Contre-preuve : `GA`/`PR` — aucune PR XL (signal `GA.xl_ratio`).

---

## Axe H — Harness

*Ce qui entoure le modèle : context engineering, comportements, garde-fous, boucles, orchestration (source de référence : `GA`, `RC`).*

### H1

**Prompts structurés** — rang Red. Marche par défaut, aucun chemin de preuve
propre, prouvée dès qu'une preuve d'usage de l'IA existe ailleurs.

### H2

**Identité projet** — rang Blue.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `H2.p1` | prouve | `RC` | `RC.identity_file_specific` | `= true` |
| `H2.p2` | prouve | `GA` | `GA.agents_md` | `= true` |

Contre-preuve : `context_files` à zéro ; `RC` fourni sans fichier d'identité.

### H3

**Mémoire vivante** — rang Blue.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `H3.p1` | prouve | `RC` | `RC.memory_files_specific_alive` | `RC.memory_files_specific_count ≥ 1 ET RC.memory_files_alive = true` |
| `H3.p2` | prouve | `GA` | `GA.agents_md_maintained` | `GA.agents_md = true ET GA.agents_md_last_updated_in_window = true` |

Contre-preuve : `RC` fourni sans mémoire ; `last_updated` hors fenêtre.

### H4

**Comportements versionnés** — rang Green.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `H4.p1` | prouve | `RC` | `RC.behavior_artifacts_specific_count` | `≥ 1 artefacts` |
| `H4.p2` | prouve | `GA` | `GA.rules_skills_agents_count` | `≥ 1 artefacts` |

Contre-preuve : `GA` à zéro et `RC` sans artefact de comportement.

### H5

**Guardrails** — rang Silver.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `H5.p1` | prouve | `RC` | `RC.guardrail_artifact_present` | `= true` |
| `H5.p2` | prouve | `GA` | `GA.hooks_count` | `≥ 1 hooks` |

Contre-preuve : `GA.hooks_count = 0` et `RC` sans guardrail.

### H6

**Boucles (artefact exécutable)** — rang Silver.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `H6.p1` | prouve | `RC` | `RC.loop_artifact_executable` | `= true` |
| `H6.p2` | indice | `S` | `S.autonomous_retry_until_green` | `= true` |

Contre-preuve : `RC` fourni sans artefact exécutable.

### H7

**Orchestration gouvernée** — rang Gold, détection grossière (non-goal assumé).

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `H7.p1` | prouve | `RC` | `RC.governed_orchestration_present` | `RC.multi_agent_orchestrator_count >= 2 ET RC.evals_or_trust_tier_present = true` |
| `H7.p2` | indice | `S` | `S.subagents_orchestrated` | `= true` |

Contre-preuve : `RC` fourni sans orchestrateur.

---

## Axe I — Intervention

*Le moment où l'humain intervient dans le cycle (source de référence : `GA`).*

### I1

**Corrige après coup** — rang Red. Marche par défaut, aucun chemin de preuve
propre, prouvée dès qu'une preuve d'usage de l'IA existe ailleurs.

### I2

**Cadre avant** — rang Blue.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `I2.p1` | prouve | `GA` | `GA.median_correction_commits_after_open` | `≤ 3 commits` |
| `I2.p2` | indice | `S` | `S.first_prompt_framed` | `= true` |
| `I2.p3` | indice | `SU` | `SU.autonomous_framing_setup_present` | `= true` (skill/agent spécifique du repo-context cadrant l'autonomie — jamais une preuve, voir § Source SU) |

Contre-preuve : `GA` correctifs `> 3`.

### I3

**Aux étapes clés** — rang Green.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `I3.p1` | prouve | `GA` | `GA.median_correction_commits_after_open` | `≤ 1 commit` |
| `I3.p2` | indice | `S` | `S.milestone_framing_present` | `= true` |

Contre-preuve : `GA` correctifs `> 1`.

### I4

**Jamais une fois cadré** — rang Silver (tranchée, prouvée ou infirmée — voir non-goals).

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `I4.p1` | prouve | `GA` | `GA.merged_without_human_edit_ratio` | `≥ 0.8 ratio ET GA.ai_coauthored_ratio ≥ 0.9 ratio` |

Contre-preuve : `GA` ratio `< 0.8` ou co-autorat `< 0.9`.

### I5

**Jamais, cadrage compris** — rang Gold, détection grossière (non-goal assumé).

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `I5.p1` | prouve | `PR` | `PR.opened_by_configured_agent_account` | `= true` |

Aucune contre-preuve définie dans le référentiel (champ `counter_proof`
absent) — sans compte d'agent configuré dans `recognaize.config.json`, le
signal reste `inconnu`, jamais `infirmé`.

---

## Axe P — Parallèle

*Le nombre de chantiers menés de front (source de référence : `GA`, `PR`).*

### P1

**Un chantier** — rang Red. Marche par défaut, aucun chemin de preuve propre,
prouvée dès qu'une preuve d'usage de l'IA existe ailleurs.

### P2

**Isolation & préparation** — rang Copper.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `P2.p1` | prouve | `GA` | `GA.concurrent_branches_with_isolation` | `(médiane ≥ 2) OU (max ≥ 2 ET RC.isolation_artifact_present = true)` |
| `P2.p2` | indice | `S` | `S.parallel_worktrees_mentioned` | `= true` |

Contre-preuve : `GA.max_concurrent_branches < 2`.

### P3

**≥ 3 habituellement** — rang Copper.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `P3.p1` | prouve | `GA` | `GA.median_concurrent_branches` | `≥ 3 branches` |
| `P3.p2` | prouve | `PR` | `PR.median_overlap_count` | `≥ 3 PR` |

Contre-preuve : `GA` médiane `< 3` ; `PR` recouvrement médian `< 3`.

---

## Axe O — Ownership (affiché, non bloquant — DEC-003)

*Ce que la personne comprend et garde en main (source de référence : `GA`, `RC`).
Calculé et affiché comme les 4 autres axes, mais exclu de la ligne de montée :
il ne peut au plus faire baisser le rang affiché d'un cran, et seulement s'il
est ≥ 2 rangs sous le rang des 4 axes officiels. Voir `METHOD.md`.*

### O1

**Lit avant de merger** — marche par défaut, aucun chemin de preuve propre.

### O2

**Vérifie**.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `O2.p1` | prouve | `GA` | `GA.prs_with_tests_ratio` | `≥ 0.5 ratio ET SO.coverage_non_regression = true` |
| `O2.p3` | indice | `S` | `S.tests_first_seen_failing` | `= true` |

Contre-preuve : `GA` tests `< 0.5` ou couverture en baisse.

### O3

**Comprend et capitalise**.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `O3.p1` | prouve | `RC` | `RC.capitalization_artifact_specific_count` | `≥ 1 artefacts` |
| `O3.p2` | prouve | `PR` | `PR.structured_body_ratio` | `≥ 0.5 ratio` |
| `O3.p3` | indice | `S` | `S.context_correction_or_rca_present` | `= true` |

Contre-preuve : `RC` fourni sans artefact et aucun body structuré.

### O4

**Délègue raisonnablement**.

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `O4.p1` | prouve | `RC` | `RC.review_agent_or_approval_gate_present` | `RC.review_agent_present = true OU RC.approval_gate_present = true` |
| `O4.p3` | indice | `S` | `S.ai_review_before_pr` | `= true` |

Contre-preuve : `RC` fourni sans reviewer ni gate.

### O5

**Gouverne l'autonomie** — détection grossière (non-goal assumé).

| `path_id` | Force | Source | Signal | Seuil |
| --- | --- | --- | --- | --- |
| `O5.p1` | prouve | `RC` | `RC.evals_and_trust_tier_present` | `RC.evals_versioned_present = true ET RC.trust_tier_or_circuit_breaker_present = true` |

Contre-preuve : `RC` fourni sans evals.
