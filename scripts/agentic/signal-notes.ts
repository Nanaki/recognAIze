/**
 * Clarifications sémantiques par signal_id, transcrites à la main depuis les
 * docstrings des checks déterministes réels (`src/checks/**\/*.ts`) : le nom
 * d'un signal_id (et son unité déclarée dans `referentiel.json`.`thresholds`)
 * ne suffit PAS toujours à deviner ce qu'il mesure réellement — certains sont
 * des PROXYS (ex. `PR.median_overlap_count` mesure en réalité des jours
 * médians entre ouverture et fusion, pas un comptage de chevauchement) ou
 * exigent une classification stricte par nom/emplacement de fichier plutôt
 * que par lecture de contenu (ex. `RC.behavior_artifacts_specific_count`,
 * `RC.guardrail_artifact_present`).
 *
 * Sans prétention d'exhaustivité au-delà des checks qui portent déjà une note
 * de proxy/ambiguïté dans leur docstring — si un nouveau signal ambigu
 * apparaît dans le référentiel, ajouter sa note ici plutôt que de laisser le
 * sous-agent deviner.
 */

export const SIGNAL_NOTES: Readonly<Record<string, string>> = {
  "PR.median_files_changed":
    "⚠️ Se CALCULE depuis pull-requests.json, ce n'est PAS un champ déjà présent tel quel dans le JSON. pull-requests.json est une LISTE de PR, chacune avec un champ numérique `changed_files` — prends la médiane de `changed_files` sur les PR mergées dans la fenêtre d'analyse (merged=true), pas sur toutes les PR (exclus les PR encore ouvertes/non mergées). JAMAIS depuis git-activity.json.pull_requests.median_files_changed (champ homonyme mais d'une source différente, qui mesure autre chose). Si pull-requests.json est absent du profil, ce signal est TOUJOURS indéterminable : OMETS-le, ne le substitue jamais par le champ de même nom trouvé dans git-activity.json.",
  "PR.median_lines_changed":
    "⚠️ Se CALCULE depuis pull-requests.json, ce n'est PAS un champ déjà présent tel quel. Chaque PR a des champs numériques `additions` et `deletions` — calcule `additions + deletions` par PR mergée dans la fenêtre, puis prends la médiane de ces sommes. JAMAIS depuis git-activity.json.pull_requests.median_lines_changed (champ homonyme mais d'une source différente). Si pull-requests.json est absent, OMETS-le systématiquement.",
  "GA.median_concurrent_branches":
    "Lire tel quel git-activity.json → parallelism.median_concurrent_branches (déjà calculé, ne pas recalculer).",
  "GA.max_concurrent_branches":
    "Lire tel quel git-activity.json → parallelism.max_concurrent_branches (déjà calculé, ne pas recalculer).",
  "RC.isolation_artifact_present":
    "Aucune catégorie d'artefact 'isolation' n'existe dans la classification repo-context réelle (9 catégories connues, aucune dédiée aux worktrees/sessions parallèles). Ce signal reste TOUJOURS non déterminable ici : ne jamais répondre true, omettre (inconnu).",
  "S.parallel_worktrees_mentioned":
    "Vrai seulement si session.md mentionne EXPLICITEMENT des sessions/worktrees parallèles (pas une déduction depuis le nombre de branches).",
  "PR.median_overlap_count":
    "PROXY, PAS un comptage de PR qui se chevauchent dans le temps. C'est en réalité la médiane du nombre de JOURS entre ouverture et fusion des PR mergées dans la fenêtre (plus une PR reste ouverte longtemps, plus elle chevauche probablement d'autres chantiers). Calculer en jours (created_at → merged_at), pas en comptage d'intervalles superposés.",
  "GA.rules_skills_agents_count":
    "Lire tel quel git-activity.json (champ dédié), jamais déduit du contenu des fichiers.",
  "RC.guardrail_artifact_present":
    "Vrai UNIQUEMENT si un artefact est classé catégorie 'hook' ou 'deny-list' par repo-context.ts — classification par NOM/EMPLACEMENT de fichier (ex. .claude/settings.json avec permissions.deny, dossier hooks/), jamais par lecture de contenu. Un fichier AGENTS.md/CLAUDE.md qui évoque des règles de sécurité en prose ne compte JAMAIS, quel que soit son contenu.",
  "GA.hooks_count":
    "Lire tel quel git-activity.json (champ dédié), jamais déduit du contenu.",
  "RC.loop_artifact_executable":
    "⚠️ Vrai UNIQUEMENT si LES TROIS conditions sont réunies : (1) artefact classé catégorie 'hook', (2) spécifique (≥2/4 indices), ET (3) le NOM DE FICHIER (relPath) correspond au motif retry/loop/until-green/auto-heal/self-heal (insensible à la casse) — les indices de spécificité (1)+(2) NE SUFFISENT PAS seuls, la condition (3) est OBLIGATOIRE et distincte. Piège vérifié en direct sur le profil leodagan : `.claude/hooks/check-assertions.js` est un hook parfaitement spécifique (chemins cités, >10 lignes, mot impératif) mais son nom ne matche AUCUN motif de boucle — c'est un linter qui tourne UNE fois et sort en erreur, jamais une boucle de relance ; ce fichier doit rester `false` malgré sa spécificité. Un document de PROSE décrivant une boucle (ex. docs/brainstorm/) ne compte de toute façon jamais, catégorie 'hook' inexistante pour lui.",
  "RC.evals_or_trust_tier_present":
    "Vrai si un NOM de fichier évoque eval/trust-tier/circuit-breaker — exclut explicitement tout ce qui est classé catégorie 'capitalisation' (ex. docs/brainstorm/, docs/decisions/) même si son contenu évoque des evals.",
  "RC.evals_versioned_present":
    "⚠️ Correspondance PURE sur le NOM DE FICHIER (motif 'eval', insensible à la casse) — jamais une inférence depuis le CONTENU. Un dossier de tests, une CI, une checklist qualité, ou une politique de permissions (.claude/settings.json) qui 'ressemble sémantiquement' à une notion d'evals NE COMPTE PAS si aucun nom de fichier ne contient littéralement 'eval'. Toute catégorie compte ici (contrairement à H7, qui exclut 'capitalisation').",
  "RC.trust_tier_or_circuit_breaker_present":
    "⚠️ Correspondance PURE sur le NOM DE FICHIER (motif 'trust-tier'/'trust_tier' ou 'circuit-breaker'/'circuit_breaker', insensible à la casse) — jamais une inférence depuis le CONTENU. Un `.claude/settings.json` avec une deny-list de permissions, un AGENTS.md qui décrit des zones 'off limits', ou toute autre politique de contrôle d'accès NE COMPTE PAS pour ce signal précis même si elle EXPRIME sémantiquement une notion de paliers de confiance — seul un nom de fichier contenant littéralement l'un de ces motifs compte. Ne confonds pas avec RC.guardrail_artifact_present/RC.approval_gate_present (eux, portent bien sur .claude/settings.json/hooks — deux signaux différents).",
  "S.files_touched_single_module":
    "Proxy structurel : plus grand groupe de chemins de fichiers distincts (mentionnés dans le digest) partageant le même premier segment de répertoire — pas une vraie notion de 'module' applicatif.",
  "PR.median_layers_touched":
    "PullRequestsData n'expose aucune notion de couche applicative (frontend/backend/infra…). Ce signal reste TOUJOURS non déterminable depuis les PR : ne jamais l'inventer, omettre (inconnu). Un autre check peut trancher T3 via GA.size_median à la place.",
  "GA.merged_without_human_edit_ratio":
    "Ratio déjà calculé par git-activity.json — dénominateur = PR mergées dans la fenêtre si pull-requests.json est présent, sinon approximation. Lire le champ tel quel, ne pas recalculer depuis les commits bruts.",
  "GA.ai_coauthored_ratio":
    "Lire tel quel git-activity.json (champ dédié).",
  "PR.opened_by_configured_agent_account":
    "Structurellement non déterminable sur un profil sans champ auteur dans pull-requests.json (vérifié : les fixtures réelles n'exposent ni 'user' ni 'login' ni 'author'). Ne jamais inventer une valeur depuis le titre/corps d'une PR — omettre (inconnu) sauf si un champ auteur existe réellement dans le fichier fourni.",
  "S.has_phased_plan":
    "Vrai seulement si session.md évoque explicitement un plan en phases/étapes (mots comme 'plan', 'phase', 'étape') — rester conservateur, ne pas déduire un phasage d'une simple liste de tâches.",
  "SO.coverage_non_regression":
    "Malgré le préfixe SO, ce signal est calculé depuis git-activity.json (tests.coverage_start / tests.coverage_end), jamais depuis sonar-measures.json (un instantané ponctuel sans référence historique). La comparaison n'est PAS une simple 'coverage_end >= coverage_start' : une tolérance de -0.02 est appliquée (coverage_end >= coverage_start - 0.02), documentée dans src/lib/coverage-non-regression.ts. Une baisse de couverture de 0 à 2 points reste donc considérée comme 'pas de régression'.",
  "S.layers_touched":
    "Nombre de catégories de couches applicatives distinctes évoquées dans session.md (dictionnaire de mots-clés fixe : frontend/backend/infra/etc.) — mention explicite requise, pas une déduction depuis les fichiers touchés.",
  "SU.size_oriented_setup_present":
    "Indice FAIBLE, jamais une preuve : vrai si un artefact skill/agent SPÉCIFIQUE (≥2/4 indices, voir note RC.identity_file_specific) du repo-context décrit explicitement une procédure orientée taille/portée (multi-fichiers, migration, plusieurs couches applicatives, refactor cross-cutting) — pas simplement un skill technique quelconque. Un skill qui décrit une tâche ponctuelle sur un seul fichier ne compte pas. La présence de ce skill ne prouve JAMAIS que le dev a réellement fait une tâche de cette taille (voir S.* pour ça) — seulement qu'il s'est équipé pour.",
  "SU.autonomous_framing_setup_present":
    "Indice FAIBLE, jamais une preuve : vrai si un artefact skill/agent SPÉCIFIQUE du repo-context définit explicitement des critères d'arrêt/complétion, un découpage en jalons/phases, ou une exécution sans validation intermédiaire attendue (ex. 'Definition of Done', 'Report nothing else', phases numérotées avec critère de passage). Ne compte pas un skill qui décrit juste QUOI faire sans jamais QUAND s'arrêter ou comment le travail est structuré. Ne prouve jamais que le dev cadre réellement ses prompts (voir S.first_prompt_framed/S.milestone_framing_present pour ça) — seulement qu'il s'est équipé pour.",
  "RC.identity_file_specific":
    "Un artefact repo-context est 'specific' (compté ici) seulement s'il satisfait ≥2 des 4 indices suivants : (1) un chemin plausible cité dans le texte (segment '/' + extension connue, ou terminé par '/'), (2) un élément de la stack technique du profil nommé explicitement, (3) ≥10 lignes utiles (non vides, hors titres markdown), (4) une formulation impérative — DÉTECTÉE UNIQUEMENT PAR DES MOTS ANGLAIS ('must', 'never', etc.) : un fichier rédigé entièrement en français ne déclenche généralement PAS cet indice 4, même s'il contient des règles impératives en français. Compter le nombre d'indices avant de conclure 'specific'.",
  "RC.memory_files_specific_count":
    "Même règle de spécificité que RC.identity_file_specific (≥2 indices/4, voir sa note) — ne compter que les fichiers de catégorie 'mémoire' (contexte vivant rechargé en routine, ex. docs/context/, aidd_docs/memory/) qui satisfont ce seuil.",
  "RC.memory_files_alive":
    "N'est PAS un signal d'usage par fichier — c'est exactement le même calcul que GA.agents_md_last_updated_in_window : un seul horodatage partagé (git-activity.json → context_files.last_updated) comparé à la fenêtre d'analyse (as_of window). Ne pas essayer de déterminer une 'vivacité' par fichier de mémoire individuel.",
  "RC.behavior_artifacts_specific_count":
    "Compte les artefacts de catégorie rule/skill/agent/prompt qui satisfont EN PLUS le seuil de spécificité (≥2 indices/4, voir note de RC.identity_file_specific) — la seule présence du fichier ne suffit pas, un fichier court ou générique (< 2 indices) ne compte PAS même s'il est bien classé dans la bonne catégorie.",
  "RC.multi_agent_orchestrator_count":
    "Compte STRICTEMENT les artefacts de catégorie 'agent' qui satisfont EN PLUS le seuil de spécificité (≥2 indices/4, voir note de RC.identity_file_specific) — un dossier .claude/agents/ avec des fichiers présents mais courts/génériques (< 2 indices chacun) donne un compte de 0, pas le nombre de fichiers présents.",
};
