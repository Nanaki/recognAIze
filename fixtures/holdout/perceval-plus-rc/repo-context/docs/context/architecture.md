# Architecture

Le service expose une API REST NestJS sur `src/modules/`, persistée par
PostgreSQL via TypeORM. Les migrations vivent dans `src/migrations/` et sont
toujours rejouées en CI avant tout déploiement.

Les modules principaux :

- `src/modules/billing/` — facturation, la zone la plus sensible du dépôt.
- `src/modules/auth/` — authentification, jamais modifiée sans revue à deux.
- `src/modules/catalog/` — catalogue produit, TypeScript strict activé.

Toute nouvelle route doit être documentée ici avant merge.
