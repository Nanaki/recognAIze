# Skill : migration PostgreSQL

Génère une migration TypeORM sous `src/migrations/`, l'applique en local, puis
vérifie que `npm run typeorm:revert` fonctionne avant de committer.
