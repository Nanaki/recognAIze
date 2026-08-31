---
objective: "Le rapport final du chemin agentique est un report.html rendu par le renderer unique de la CLI (report/html.ts), via un nouveau mode `export`, jamais un Markdown réécrit à la main — comparaison au chemin déterministe conservée."
status: implemented
---

<!-- Fill or omit these sections; never add, rename, or reorder one. -->

# Plan: Parité report.html pour le chemin agentique via un mode export CLI

## Overview

| Field      | Value                                                                                                                                                                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**   | Ajouter un mode `export` à la CLI (données déjà calculées → `report.html`, sans réanalyse) et faire produire par le skill `recognaize-agentic` un `report.html` — au lieu d'un `report.md` fait main — en appelant ce mode, tout en gardant les sections de comparaison au chemin déterministe. |
| **Source** | Message utilisateur (texte, 2026-08-31) : « modifier le skill du projet pour que son report.md soit exactement au même format que le report.html de la cli, quitte à ce que l'agent passe des données à la cli et que la cli ait un mode "export"… »                                                    |

## Phases

| #   | Phase                                                        | File                          |
| --- | ------------------------------------------------------------ | ------------------------------ |
| 1   | Mode export CLI + section agentique dans report/html.ts       | [`phase-1.md`](./phase-1.md)   |
| 2   | Le pont agentique produit les données d'export et appelle la CLI | [`phase-2.md`](./phase-2.md)   |
| 3   | Vérification bout-en-bout, mémoire projet, non-régression     | [`phase-3.md`](./phase-3.md)   |

## Resources

<!-- External sources only (URLs, docs), not code files. Omit if none consulted. -->

Aucune source externe consultée — changement interne au dépôt.

## Decisions

<!-- Architecture-magnitude only, one you'd regret reversing. Omit if none qualify. -->

| Decision | Why |
| --- | --- |
| Le 3ᵉ fichier de sortie du chemin agentique devient `report.html` (plus `report.md`) | Le format demandé (« exactement le même format que report.html ») n'est atteignable qu'en réutilisant le renderer HTML lui-même, pas en l'imitant en Markdown — un Markdown ne peut pas être « exactement » un HTML. |
| `report/html.ts` gagne un paramètre optionnel `agenticContext` (banner + comparaison + delta de confiance + diff des incohérences), plutôt qu'un second renderer | Un seul renderer testé reste la source de vérité du format (contrainte explicite de l'utilisateur) ; absent (chemin déterministe), la sortie doit rester strictement identique aux golden/snapshots existants — verrouillé par les tests existants, jamais dupliqué dans le skill. |
| Le mode `export` de la CLI calcule lui-même les champs administratifs de `result.json` (`schema_version`, `tool_version`, `referentiel_hash`, `node_version`, `pieces_et_champs_ignores`) — le pont agentique ne fournit que le contenu jugé (rang/fourchette/confiance/axes/ownership/verdicts/evidence/warnings/incoherences) | Ces champs sont déjà calculés de façon identique par `analyze` (lecture de `package.json`, hash du référentiel déjà chargé) — les faire fournir par l'appelant dupliquerait une logique déjà pure et testée, avec un risque de désynchronisation (ex. `referentiel_hash` qui ne correspondrait pas au référentiel réellement chargé par la CLI). |
| `ReportExtras.gitActivity`/`sonarMeasures` sont dérivés par la CLI elle-même depuis `--profile-dir` (adaptateurs `src/sources/git-activity.ts`/`sonar.ts` déjà existants), jamais recalculés côté skill ; `declaratif.md` n'est jamais lu par le mode export | Respecte DEC-004 structurellement (jamais une logique de lecture dupliquée côté skill) et réutilise les adaptateurs tolérants déjà testés au lieu d'en écrire une seconde version dans `scripts/agentic/`. |
| Une entrée `export` malformée est un `UsageError` (exit 3), jamais un `RefusedError` (exit 2) ni une erreur interne (exit 1) | Une donnée d'entrée invalide pour un mode CLI est un usage invalide (même famille que `--mode inconnu`, chemin inexistant), pas un profil insuffisant (exit 2, réservé à `analyze` sur un dossier de profil) ni un bug interne (exit 1, réservé au catch générique). |
| Le **rendu** (`export`, `report/html.ts`) est garanti déterministe (même entrée → `report.html` byte-identique, testé) ; le **pipeline agentique complet** (extraction LLM incluse, actions 01-03) reste explicitement NON garanti déterministe d'une exécution à l'autre | Ce sont deux propriétés différentes : le rendu est une fonction pure, testable et sans horloge (même standard que le reste de `report/html.ts`) ; l'extraction est un LLM lisant du texte brut, sujette à variation par nature. Prétendre que le pipeline complet est déterministe contredirait `SKILL.md` (déjà explicite sur ce point) et `.claude/rules/fiabilite.md` — cette limite structurelle n'est pas corrigée par ce plan, seulement non aggravée. |
| L'option de la commande `export` s'appelle `--profile-dir` (jamais `--profile`/`--source`) et `report-input.json` est un artefact PERMANENT de `recognaize-out-final/<profile_id>/` (jamais supprimé après l'appel à `export`) | Nommage aligné sur le vocabulaire déjà établi (`profile_dir` dans le skill agentique, `aidd_docs/memory/architecture.md`) ; conserver `report-input.json` permet de rejouer `export` seul (déboguer un rendu sans relancer les sous-agents) et de couvrir son déterminisme par un test direct, sans dépendre d'un run agentique complet. |
