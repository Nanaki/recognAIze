# Règle : backend NestJS

- Toujours valider les DTO avec `class-validator` avant d'écrire en base
  PostgreSQL.
- Ne jamais exposer un `Repository` TypeORM directement hors de `src/modules/`.
- Toujours écrire un test d'intégration pour chaque nouvel endpoint.
