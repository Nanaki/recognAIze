---
name: branch
description: VCS branch naming convention template
argument-hint: N/A
scope: all
---

# Versioning Control System (VCS) Guidelines

- Main Branch: `main` (gelée par le tag `v1.0.0-rendu` avant le rendu ; suite sur `next`)
- Platform: `github` (dépôt `Nanaki/recognAIze`, **privé** depuis le 2026-08-30 ;
  passage en public MIT reste une action humaine restante avant le rendu)
- Remote: `origin` = `git@github.com:Nanaki/recognAIze.git` (compte perso
  `Nanaki`, jamais une org) ; `feat/mvp-chemin-jury` poussée, `main` jamais
  touchée.
- CLI: `gh`
- MCP: aucun
- Ticketing Tool: `files`

## Ticketing (files)

- Tracker = fichiers Markdown versionnés, pas de service externe.
- Capacités livrées : `aidd_docs/features.md` ; décisions d'architecture : `ADR.md`.

## Branch Naming Convention

### Format

Une seule branche de travail pour l'ensemble du MVP « chemin jury » : `feat/mvp-chemin-jury`. Commits atomiques, aucune branche ni MR par sous-tâche. Une seule MR est ouverte vers `main` à la fin, après revue.

Convention générale pour tout travail futur hors de ce run (format par défaut) :

```text
type/US-XXX-short-description
```

### Types

| Prefix       | Usage                     |
| ------------ | ------------------------- |
| `feat/`      | New feature               |
| `fix/`       | Bug fix                   |
| `docs/`      | Documentation only        |
| `refactor/`  | Code change (no feat/fix) |
| `chore/`     | Build, config, deps       |
| `test/`      | Add/update tests          |

### Examples

```text
feat/judge-rank-fourchette
test/e2e-jury
docs/method-page
```

## Commit Convention

### Format

```text
type(scope): description

[optional body]

[optional footer]
```

### Types

| Type       | Usage                        |
| ---------- | ---------------------------- |
| `feat`     | New feature                  |
| `fix`      | Bug fix                      |
| `docs`     | Documentation only           |
| `refactor` | Code change (no feat/fix)    |
| `test`     | Add/update tests             |
| `chore`    | Build, config, deps          |
| `ci`       | CI/CD configuration          |

### Description rules

- Imperative mood, lowercase, no period, max 72 chars ; scope = module (`judge`, `sources`, `checks`, `report`, `eval`, `cli`).
- Un commit touchant `core/`, `checks/` ou `referentiel.json` n'est créé qu'avec `npm run eval` vert.
- Aucune clé ni secret, jamais, dans aucun commit (gitleaks en pre-commit et sur tout l'historique avant rendu).

### Examples

```text
feat(judge): compute fourchette from proven and unknown rungs
test(eval): add ablation runner over the four fixtures
```
