---
name: coding-assertions
description: Code quality verification checklist
argument-hint: N/A
scope: all
---

# Coding Guidelines

> Those rules must be minimal because the MUST be checked after EVERY CODE GENERATION.

## Requirements to complete a feature

- Typecheck, lint et tests unitaires verts.
- `npm run eval` vert (4/4 rang exact Ownership on/off, fixtures négatives, ablation, hold-out, déterminisme) avant tout commit touchant `core/`, `checks/` ou `referentiel.json`.
- Aucun seuil en littéral dans `src/checks/**` (lus dans `referentiel.json`) ; aucun `path_id` orphelin.
- Aucune exception ne traverse une frontière ; `core/` n'importe jamais `checks/` ; zéro `Intl` / `toLocaleString` / `Date.now()` dans le calcul.
- Toute fonctionnalité livrée est couverte par un test ou une eval, sinon elle est retirée (DEC-001).

**A feature is really completed if ALL of the above are satisfied: if not, iterate to fix all until all are green.**

## Commands to run

### Before commit

| Order | Command | Description |
| ----- | ------- | ----------- |
| 1 | `npm run typecheck` | `tsc --noEmit` |
| 2 | `npm run lint` | ESLint : `no-restricted-imports` (core → checks), `no-restricted-globals` (Intl) |
| 3 | `npm test -- --changed` | tests unitaires et contract tests liés au diff |
| 4 | `gitleaks protect --staged` | aucun secret |

### Before push

| Order | Command | Description |
| ----- | ------- | ----------- |
| 1 | `npm run build` | `checks:index` puis `tsc` vers `dist/` |
| 2 | `npm test` | suite complète : e2e « chemin jury » sur `dist/cli.js`, checks, sources, juge (property), golden, snapshots |
| 3 | `npm run eval` | étalons, fixtures négatives, ablation, hold-out, fuzzer, déterminisme |
