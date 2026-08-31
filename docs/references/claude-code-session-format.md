# Format des sessions Claude Code (vérifié le 2026-08-28 sur ~/.claude/projects)

- Emplacement : `~/.claude/projects/<cwd-encodé>/<sessionId>.jsonl` — un fichier par session, `sessionId` = nom du fichier (vérifié : jamais plusieurs sessionId par fichier).
- Enregistrement = 1 ligne JSON. Champs communs : `type` (user | assistant | system | attachment | file-history-snapshot | …), `subtype`, `uuid`, `parentUuid`, `timestamp`, `sessionId`, `cwd`, `gitBranch`, `version`, `permissionMode`, `isSidechain` (sous-agent), `slug` (nom lisible), `promptId`.
- `message.content` : string ou liste de blocs (`text`, `tool_use` {name, input}, `tool_result`, `thinking`).
- **Compactage** (même fichier) :
  - `type: system, subtype: compact_boundary`, `compactMetadata: { trigger: auto|manual, preTokens, postTokens, cumulativeDroppedTokens, durationMs, preservedSegment{headUuid, anchorUuid, tailUuid}, preservedMessages }`, `logicalParentUuid` = dernier message avant compactage.
  - suivi d'un `type: user`, `isCompactSummary: true`, `isVisibleInTranscriptOnly: true`, contenu = "This session is being continued from a previous conversation that ran out of context. Summary: 1. Primary Request and Intent: …" → digest gratuit de la partie perdue.
- **Liens inter-sessions (hypothèses à confirmer à l'implémentation)** : `session_id` (snake_case) sur le résumé de compactage pointant vers un autre fichier ; `parentSessionId` sur certains enregistrements (fork) ; `slug` partagé ; `resumedAgentId` pour les sous-agents.
- `gitBranch` vaut très souvent `HEAD` (worktree / détaché) → repli sur `cwd` (chemin de worktree) et sur les commandes git/gh dans les `tool_use` Bash.
- Signaux extractibles sans LLM : premiers prompts (structure, contraintes, fichiers cités), séquence d'outils (Read/Grep → plan → Edit/Write → Bash tests), qui lance les checks, reformulations, nombre de compactages et tokens jetés, sous-agents, skills invoqués, durée, tokens (usage sur les messages assistant), permissionMode, fichiers touchés.
