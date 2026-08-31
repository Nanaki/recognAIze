import { defineConfig } from "vitest/config";

// Portée volontairement restreinte à test/** : sans ça, vitest ramasse par défaut
// tout *.test.ts du dépôt, y compris les tests embarqués DANS le code des profils
// étalons (fixtures/profiles/*/code/*.test.ts — matière du sujet analysé, pas des
// tests de cet outil). Le test e2e « chemin jury » (Part 1, phase 4) attend un
// budget large (clone + npm ci + build).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "fixtures/**", "recognaize-cli-out/**"],
    testTimeout: 120_000,
  },
});
