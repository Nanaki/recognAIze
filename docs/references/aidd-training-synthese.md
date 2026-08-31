# Rapport aidd-training — synthèse (agent)

## Progression implicite (échelle de maturité)
1. Setup & intégrations (env, CLI, MCP, navigateur)
2. Premier prompt fonctionnel → "ça marche mais ne suit pas vos règles"
3. Prompt structuré (6 parties : rôle IA / rôle moi / goal / rules / context / example), comparaison de modèles
4. Audit → règles → fix (règles issues de findings réels, preuve de chargement, glob applyTo)
5. Fichier d'identité projet (AGENTS.md : WHAT the project IS vs rules = HOW)
6. Memory bank (architecture, conventions, décisions, incidents) + guardrails "NEVER"
7. Preuve du contexte : prompt 2 lignes → sortie conforme ; test A/B avec/sans
8. Plan mode puis implémentation ; "Plan = functional review, code = rules review"
9. Bibliothèque de prompts écrite à la main (commit/deploy avec approval gate, review avec sévérités, analyse d'erreur → règle de prévention)
10. Tests + agents spécialisés (test-fix, quality-gate) avec limite d'itérations, revert, mode suggestion
11. Livraison outillée : commit conventionnel, MR templatisée, ticket → MR, gap analysis PRD
12. Diagnostic structuré (hypothèses avant fix, RCA 5 Whys) + boucle d'amélioration des règles (learn)
13. Guardrails automatisés : hook post-écriture, pre-commit bloquant, CI gates, policy-as-code
14. Autonomie gouvernée : trust tiers, circuit breakers, runbooks, mémoire d'incidents, maturité AIOps 0-3

Débutant = prompte et accepte · Intermédiaire = audite, codifie des règles, configure le contexte, planifie, garde la main sur l'irréversible · Avancé = outille (prompts, agents, hooks, gates), mesure, fait évoluer ses règles · Expert = gouverne l'autonomie.

## Artefacts observables dans un dépôt
1. Fichier d'identité projet racine (rôle IA, stack, archi, anti-patterns numérotés, guardrails NEVER, liens mémoire)
2. Règles scopées par glob avec front-matter, exemples ✅/❌, traçabilité vers le finding
3. Memory bank : docs/memory-bank/{architecture,conventions,incidents}.md, TEST_STRATEGY.md, trust-tiers.md
4. Bibliothèque de prompts versionnée : commit, MR, deploy (gates), review, analyse d'erreur, gap analysis, doc
5. Agents spécialisés (front-matter, périmètre, max itérations, revert, format de rapport)
6. Skills (SKILL.md + contrat de sortie) séparés des agents
7. Hooks : post-écriture agent, pre-commit/commit-msg (lefthook/husky/commitlint)
8. Templates MR/issue avec checklist et preuves
9. Config intégrations (.vscode/mcp.json, CLI VCS)
10. Pipeline CI lint → check → policy → deploy avec approbation ; drift detection ; self-healing
11. Conventions git (conventional commits, tags de checkpoint)

## Méthodo & place de l'humain
- Cycle : brainstorm/US → ticket → plan (revue fonctionnelle) → implement → assert/test → review → commit → MR → learn
- DoD automatisée (quality-gate agent / assert : types, lint, tests, coverage, e2e, build)
- Boucle : generate → audit → improve rules → generate better ; update memory after each feature
- Nouveau chat pour fix/enquête ; vérifier que les fichiers sont chargés ; "context > prompt length"
- Diagnostic : symptôme → hypothèses classées → confirmation → fix → re-test
- Ownership : human in the loop pour l'action finale ; prompts de review écrits sans IA ; "agent proposes, human disposes" ; "governed autonomy"
- CLI > MCP pour VCS (sécurité/auditabilité)

## Matériel d'évaluation notable
- Preuve de chargement de contexte (easter egg, references, A/B)
- Guardrail refusé par l'IA (refuse apt-get shell)
- Agent : max iterations 3, revert logic, suggestion mode, never delete a test / never weaken an assertion
- Debug : root cause via hypothèses avant fix
- Hook : commit sale bloqué / commit propre passe
- Gouvernance : MR requiert approbation humaine ; circuit breaker ; AIOps maturity 0/1/2/3 (target 20+/30)
- Prompt review noté /10 (9-10 production-ready … 3-4 poor)
- Bootcamp : White (setup) → Red (feature S) → Blue (feature M) → Green (feature L) → certification

## 25 checks (stade)
1 Feature fonctionnelle depuis prompt fonctionnel, lancée et testée — Déb
2 Audit critique structuré du code généré, désaccords argumentés — Déb→Int
3 Comparer 2 modèles et justifier — Déb
4 Prompts structurés (rôle/objectif/règles/contexte/étapes/exemple) + contraintes de périmètre — Int
5 Règles scopées par glob, do/don't issus de findings, référence au problème évité — Int
6 Prouver que règles/contexte sont chargés ; diagnostiquer glob — Int
7 Fichier d'identité projet + distinction règle/garde-fou — Int
8 Memory bank persistante ; IA répond "quelle archi ?" sans contexte manuel — Int
9 Prompt 2 lignes → sortie conforme aux conventions — Int→Av
10 Savoir quand planifier ; revue fonctionnelle du plan — Int
11 Vérifier code vs règles ; corriger la règle plutôt que seul le code — Int
12 Bibliothèque de prompts versionnée, écrite par lui, approval gate avant l'irréversible — Int→Av
13 Prompt de review avec critères, sévérités, format, attrape violations délibérées — Av
14 Analyse d'erreur → cause → fix → règle de prévention réinjectée — Av
15 Bug : hypothèses classées, cause confirmée avant fix, re-test — Av
16 Tests jugés sur comportement, anti-flaky, factories, seuils bloquants, runs répétés — Av
17 Agents : périmètre, max itérations, revert/escalade, rapport, interdits — Av
18 Sépare skill (quoi) / agent (comment) / hook (quand) — Av→Exp
19 Guardrails à 3 niveaux : génération, commit, CI — Av
20 Livraison traçable ticket → plan → impl → tests → review → commit → MR — Av
21 Gap analysis spec vs code → MAJ mémoire — Av
22 Fait évoluer règles et mémoire après chaque feature (diff de règles motivé) — Av→Exp
23 CLI vs MCP, intégrations documentées — Int
24 Trust tiers, éligibilité auto-fix, circuit breakers, "propose don't execute" — Exp
25 Auto-évalue la maturité du harness capacité par capacité, prochaine marche — Exp
