// ESLint flat config (ESLint 9+ style).
//
// Two determinism/architecture rules enforced project-wide, per
// .claude/rules/fiabilite.md:
//   - `src/core/**` must never import `src/checks/**` (core stays check-agnostic).
//   - `Intl`, `.toLocaleString(` and `Date.now(` are forbidden anywhere under
//     `src/**` because they break the "same input -> same result.json"
//     determinism guarantee (locale/timezone/current-time dependent).
//
// TypeScript-aware since phase 3 (`typescript-eslint`, the all-in-one modern
// package): `tseslint.configs.recommended` gives the TS parser + recommended
// rules for `src/**/*.ts`; the project-specific rules below stay layered on
// top, unchanged.

import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "fixtures/**", "recognaize-cli-out/**"],
  },
  {
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.recommended],
  },
  {
    // Sans ce bloc, `eslint .` ignore silencieusement test/**/*.ts (aucune config
    // ne le matche) — le gate lint deviendrait un no-op pour la suite e2e.
    files: ["test/**/*.ts"],
    extends: [tseslint.configs.recommended],
  },
  {
    // Même raison que le bloc `test/**/*.ts` ci-dessus, pour `evals/**/*.ts`
    // (Part 4, phase 1 : `evals/anti-literal.ts`).
    files: ["evals/**/*.ts"],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ["src/core/**/*.{js,ts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/checks/**", "../checks/**", "../../checks/**", "*/checks/*"],
              message:
                "src/core/** ne doit jamais importer src/checks/** — frontière imposée par .claude/rules/fiabilite.md.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{js,ts}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "Intl",
          message:
            "Intl est dépendant de la locale — interdit sous src/** (déterminisme, voir .claude/rules/fiabilite.md).",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Date",
          property: "now",
          message:
            "Date.now() casse le déterminisme — dérive la date de référence des données ou de --as-of (voir .claude/rules/fiabilite.md).",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='toLocaleString']",
          message:
            ".toLocaleString() est dépendant de la locale — interdit sous src/** (déterminisme, voir .claude/rules/fiabilite.md).",
        },
        {
          selector: "MemberExpression[object.name='Intl']",
          message:
            "Intl est dépendant de la locale — interdit sous src/** (déterminisme, voir .claude/rules/fiabilite.md).",
        },
      ],
    },
  },
);
