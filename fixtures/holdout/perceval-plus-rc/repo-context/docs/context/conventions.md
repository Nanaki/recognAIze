# Conventions

- Commits conventionnels, scope = nom du module NestJS touché.
- Toujours typer les retours de contrôleur avec un DTO explicite.
- Jamais de `any` dans `src/modules/`, `tsconfig.json` a `strict: true`.
- PostgreSQL : toute requête brute passe par un repository dédié, jamais un
  `query()` direct dans un contrôleur.
