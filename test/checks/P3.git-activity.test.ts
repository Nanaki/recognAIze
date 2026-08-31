import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/P3.git-activity.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("P3.git-activity — GA.median_concurrent_branches ≥ 3", () => {
  test("median_concurrent_branches = 1, max = 2 → P3 infirmée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { parallelism: { median_concurrent_branches: 1, max_concurrent_branches: 2 } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("median_concurrent_branches = 3 (seuil exact) → prouvée", () => {
    const ctx: ProfileContext = { ...EMPTY, gitActivity: { parallelism: { median_concurrent_branches: 3 } } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("champ absent → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
