---
name: deployment
description: Infrastructure and deployment documentation
argument-hint: N/A
scope: all
---

# Deployment

> État : réel, vérifié contre `.github/workflows/ci.yml`, `package.json` et le
> dépôt distant.

Aucun hébergement : l'outil est une CLI locale distribuée par le dépôt GitHub
(`Nanaki/recognAIze`, **privé** — passage en public avant le rendu reste une
action humaine restante, voir `docs/rendu.md`).
Branche `feat/mvp-chemin-jury` poussée, `main` jamais touchée. « Déployer » =
publier un tag ; « exécuter » = deux commandes sur la machine de l'utilisateur.
Gate local vert à chaque commit (pre-commit : typecheck, lint, tests,
`npm run eval` quand pertinent).

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/ci.yml`, push et pull request)

- **Steps** (job `build-test-eval`, matrice `ubuntu-latest`/`macos-latest` × Node 20/22) :
  1. `actions/checkout@v4`, `actions/setup-node@v4` (cache `npm`).
  2. `npm ci --ignore-scripts` (aucun secret, aucun réseau après installation).
  3. `npm run build` (génère `src/checks/index.ts`, compile `dist/`, copie les
     assets `referentiel*`).
  4. `npm test` (`vitest run` — inclut l'e2e « chemin jury » sur le binaire
     construit).
  5. `npm run eval` (`tsx evals/run.ts`).

- **Test Automation** :
  - Unit tests : `npm test` (1 test par check, juge, sources, registre,
    invariants, snapshot HTML/JSON).
  - Integration/eval tests : `npm run eval` — rangs attendus, fixtures
    négatives, ablation, hold-out, anti-littéral.
  - E2E : `test/e2e-jury.test.ts`, clone frais simulé + `npm ci --ignore-scripts
    && npm run build` + `node dist/cli.js analyze <profil>`.

- **Deployment Triggers** :
  - Manual : tag `v1.0.0-rendu` posé après gel ; `main` gelée, suite sur `next`.
  - Automated : aucun.

- **Matrice CI** : les 4 jambes (Node 20/22 × Ubuntu/macOS) plus le job
  `secrets` tournent réellement sur le dépôt distant, pas seulement en local.
  `test/sources/read.test.ts` couvre explicitement l'insensibilité à la casse
  du système de fichiers (APFS/HFS+) sur le tri par points de code, pour ne
  jamais dépendre d'une collision de noms `A.txt`/`a.txt` propre à une
  plateforme.

## Monitoring & Logging

- **Logging** :
  - Avertissements et incohérences listés dans `result.json` (et dans
    `report.html`) ; avec `--json`, `stdout` ne porte que le JSON.
  - Sans `--json`, `analyze` est silencieux sur `stdout` en cas de succès
    (vérifié : exit `0`, aucune sortie) — seul le contenu de
    `recognaize-cli-out/<sujet>/` fait foi.
  - `--verbose` n'existe pas dans `cli.ts` : un drapeau sans effet observable
    et sans test l'exerçant serait contraire à DEC-001, même motif que
    `--no-llm`.
  - `tool_version`, `schema_version`, `referentiel_hash`, `node_version`,
    `as_of` stampés dans `result.json`. Pied de `report.html` : seulement
    `tool_version`/`schema_version`/`referentiel_hash` (`node_version`/`as_of`
    non affichés — non pertinents pour un lecteur du rapport, restent dans
    `result.json`).

## Deployment Process

- **Rollback Procedure** :
  1. Un tag est immuable ; toute correction post-gel va sur `next`.
  2. Le formulaire de rendu (`docs/rendu.md`) pointe le tag, jamais `main`.

# Infrastructure

## Project Structure

```plaintext
recognAIze/
├── dist/                  # construit en CI et localement (non commité)
├── fixtures/profiles/     # étalons MIT (SHA épinglé, voir ATTRIBUTION.md)
├── fixtures/{hostile,holdout,synthetic}/  # fixtures adverses et mutants datés
├── recognaize-cli-out/<sujet>/   # sorties locales (report.html, result.json, runs/)
└── .github/workflows/ci.yml
```

## Environment Variables

### Required Environment Variables

Aucune dans le périmètre livré : l'outil ne lit aucune clé. `ANTHROPIC_API_KEY`
resterait réservée à un pack `experimental-llm` qui existe comme tableau vide
dans `src/packs.ts` mais ne contient aucun check exécutable — hors périmètre
(`aidd_docs/features.md` § Hors périmètre).

## URLs

- **Development** :
  - URL : `file://…/recognaize-cli-out/<sujet>/report.html`
  - Purpose : lecture locale de la fiche, sans serveur.
