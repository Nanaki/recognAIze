# AGENTS.md — perceval-plus-rc (mutant du hold-out)

Ce dépôt est un backend TypeScript/NestJS avec PostgreSQL. Le code source vit
dans `src/`, les migrations dans `src/migrations/`, et les tests dans `test/`.

- Ne jamais committer de secret dans `src/config/`.
- Toujours lancer `npm run test` avant d'ouvrir une pull request.
- Toujours documenter une décision de schéma dans `docs/context/architecture.md`.
