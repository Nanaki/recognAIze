import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/P2.git-activity.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("P2.git-activity — median_concurrent_branches ≥ 2 OU (max ≥ 2 ET isolation)", () => {
  test("median_concurrent_branches = 1, max = 2, pas de repoContext (isolation inconnue) → P2 inconnue", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { parallelism: { median_concurrent_branches: 1, max_concurrent_branches: 2 } },
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("median_concurrent_branches = 2 (seuil exact) → prouvée sans besoin d'isolation", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { parallelism: { median_concurrent_branches: 2, max_concurrent_branches: 1 } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("max = 2 et repoContext avec artefact .worktreeinclude → prouvée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { parallelism: { median_concurrent_branches: 1, max_concurrent_branches: 2 } },
      repoContext: {
        artifacts: [
          {
            relPath: "repo-context/.worktreeinclude",
            category: "regle",
            lineCount: 1,
            specific: true,
            specificityHints: [],
            used: false,
            usageHints: [],
          },
        ],
      },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("max = 1 (< 2) → contre-preuve", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { parallelism: { median_concurrent_branches: 1, max_concurrent_branches: 1 } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("champs absents → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
