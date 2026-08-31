# Rapport aidd-courses — synthèse (agent)

## Piliers & formules
- 4 piliers : planification, contexte, itération, validation (0100_mindset)
- Agent = Model + Harness (0401) ; couche contexte (ce que l'IA sait) / couche comportement (comment elle agit)
- Manifeste 17 lois (0101) : planifier, lire l'output, less is more, 1 feature = 1 conversation = 1 PR, human in the loop, "tout est de notre faute", savoir abandonner une session, l'IA accélère ce qu'on sait déjà faire

## Niveaux (0002_levels.md)
- White : "Je n'utilise pas encore l'IA de manière structurée pour coder."
- Red : "Je sais livrer une feature S avec l'IA. Je comprends les limites des LLM et je structure mes prompts."
- Blue : "Je livre des features M avec Context Engineering, tests et guardrails. Mais je corrige encore l'IA."
- Green : "Je maîtrise le flow complet d'AIDD sur des features L avec qualité irréprochable."
- Copper : 3 features M en parallèle — "plusieurs terminaux en même temps, features L et XL"
- Silver : 1 prompt = 1 feature M complète — "agent qui code seul, specs → PR, qualité 100 %"
- Gold : 3 features L en parallèle — "plusieurs IA autonomes en parallèle"
- Validation : auto-identification + coach ; certification live Green→avancé. "Votre niveau reflète votre pratique réelle."

## Grille de symptômes d'auto-évaluation (0100_mindset) — 3+ dans une catégorie = axe prioritaire
- Manque de contexte : l'IA ignore mes conventions / je rappelle souvent l'archi / l'IA recrée du code existant
- Prompts mal formulés : je reformule 3-4 fois / chaque prompt de zéro / je demande du code sans découper / je crie sur l'IA
- Limites techniques : je m'énerve sur les hallucinations / frustré par l'inconsistance / j'attends du parfait du premier coup

## Compétences par maturité (D=White/Red, I=Blue, A=Green, E=Copper+)
- Posture : piloter plutôt que subir (D), modèle probabiliste (D), "tout est de notre faute" (D→I), calibrer attentes (D), reconnaître session morte (D→I), problem shaper (I→A)
- Prompt : structure Goal/Rules/Context (+Role/Steps/Examples) (D), 7 techniques (D→I), cycle de vie d'un prompt, validation en chat vierge (I), évaluer sortie sur 3 dimensions (I), bibliothèque partagée (I), choix du mode voix/texte/manuel (D)
- Contexte : séparer contexte/comportement (I), mémoire minimale suffisante (I), règle des 90 % (I), lier prompts & contexte (I), contexte vivant — PR code + contexte, ADR (I→A), encoder l'architecture C4/ADR/tests d'archi (A), grosse codebase hiérarchie (A), clean code lisible IA (I→A)
- Harness : choisir la brique règle/skill/agent/commande/hook (I→A), règles efficaces (I), concevoir un agent (A), skills use when / do not use (A), hooks déterministes (A), packager plugin (E), boucle d'exécution : critère binaire + max itérations + escalade (I→A), guardrails 3 niveaux minimal/standard/full (I), gestion des échecs retry/repli/escalade (A), tool dispatch natif→CLI→MCP (I→A), sécurité lethal trifecta, deny rules, pinning (I→A), protection CI (I)
- Planification : clarifier avant (D→I), plan explicite validé 90 %+ (I), savoir sauter le plan (D), granularité 1 feature = 1 PR (I→A), flow bout en bout (I→A), savoir recommencer (I→A), versioning auto (D→I), refacto legacy (A)
- Revue/ownership : human in the loop (D), revue 5 niveaux (I), superviser activement → correction permanente du contexte (I), matrice criticité×complexité (I→A), domaines non délégables (I)
- Tests : TDD semi-autonome (I), coverage-driven (I), scripts de données (I), E2E/self-healing (I→A), validation visuelle (A), RCA (I), evals de sorties IA (A→E), TIA (A)
- Agentique : paralléliser (I→E), worktrees/multi-console/background/SDK (I→A), niveaux de délégation (I→A), dual-agent producteur/vérificateur (A), boucles autonomes longues (E), orchestration explicite workflows > agents (E)
- Produit : signal≠besoin, brief, PRD, panel, métriques, backlog INVEST (I→A)
- Équipe : adoption guidée, standards comme bien commun, rituels, mesure (A)
- Ops : DRIVE, GitOps HITL, policy-as-code, self-healing 3R, AIOps (A→E)

## Anti-patterns clés
vibe coding / lire en diagonale / merge sans regarder / contexte pollué / context rot / crier / IA pour <30s ou pour ce qu'un linter fait / générer sans comprendre / FOMO outils / agent fourre-tout, boucle sans borne, producteur=validateur / retry à l'identique / @latest MCP, secrets / tous les tests d'un coup / reward hacking (supprimer le test) / détecteurs de code IA comme preuve / full auto dès le départ

## Coût & modèles
- ROI = temps gagné × coût horaire / coût outil ; TCO inclut tokens
- Tiers : Thinking (plan, archi, debug) / Medium (impl) / Fast (sous-agents, exploration, commit) ; spécifier le tier minimum suffisant par tâche
- Économie de tokens : conversations courtes, mémoire < 10 %, MCP < 10 %, CLI > MCP, sous-agents pour isoler, proxy compressant
- Local : classification critique/sensible/standard ; Ollama/LM Studio ; 7B ≈ 16 Go ; fine-tuning déconseillé
- "ne jamais utiliser les modes auto"

## KPIs dev (0210) : temps par PR, retours par PR, couverture, lignes manuelles, niveau AIDD, taux de réussite prompt, heures IA/jour, charge cognitive, confiance

## Seuils utiles
- prompt réutilisable si répété > 3×/semaine ; skill si 2-3× à 90 % identique
- plan sauté si < 10 lignes ; plan fichier pour L/XL ; master plan ≥ 8 phases ; redémarrer > 50 % contexte
- boucle : max 3-5 itérations ; autonomie niveau 0→2 : 50 déploiements 0 incident, 6 mois

## 25 checks (niveau cible)
1 plan écrit relu avant code (Red/Blue) · 2 prompt structuré réutilisé (Red) · 3 1 feature=1 PR, découpe >5-7 phases (Blue) · 4 signaux de session dégradée, MAJ mémoire avant restart (Red/Blue) · 5 échec → modifie règle/mémoire, pas retry (Blue) · 6 mémoire projet structurée, règle 90 % (Blue) · 7 PRs code+contexte/ADR (Blue/Green) · 8 règles courtes scopées vérifiées (Blue) · 9 guardrails 3 niveaux, deny destructif (Blue/Green) · 10 boucles à critère binaire + max itér + escalade (Green) · 11 producteur/validateur séparés + self-review (Green) · 12 argumente règle/skill/agent/hook (Green) · 13 tool dispatch, nb MCP, lit sa context window (Blue/Green) · 14 tier de modèle par tâche (Blue) · 15 sécurité MCP pin, secrets, checkpoint, pas d'auto-merge (Blue/Green) · 16 classification données, anonymisation (Red/Blue) · 17 TDD semi-auto, scripts de données (Blue) · 18 RCA hypothèses + test échouant (Blue) · 19 evals avec seuil (Green/Copper) · 20 parallélisme worktrees (Copper) · 21 feature M spec→PR sans intervention, merge humain (Silver) · 22 matrice délégation, domaines non délégables (Blue) · 23 issues = problème + AC + edge cases (Green) · 24 contribue à lib partagée (Green/lead) · 25 baseline & KPIs (Blue/Green)
