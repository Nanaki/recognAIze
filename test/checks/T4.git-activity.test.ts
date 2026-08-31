import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/T4.git-activity.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("T4.git-activity — GA.xl_ratio ≥ 20 %, contre-preuve = aucune PR XL", () => {
  test("xl_ratio = 20 % (seuil exact) → prouvée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { total: 10, size_distribution: { xl: 2 } } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("xl_count = 0 (aucune PR XL) → contre-preuve, même avec un ratio proche du seuil pour d'autres classes", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { total: 10, size_distribution: { xl: 0 } } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
    expect(evidence[0]?.citation).toContain("aucune PR XL");
  });

  test("xl_count = 1, ratio = 10 % (< 20 % mais pas zéro) → ni prouvée ni infirmée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { total: 10, size_distribution: { xl: 1 } } },
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("total absent → aucune Evidence, jamais de NaN", () => {
    const ctx: ProfileContext = { ...EMPTY, gitActivity: { pull_requests: { size_distribution: { xl: 1 } } } };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("total = 0 → aucune Evidence (pas de division par zéro)", () => {
    const ctx: ProfileContext = { ...EMPTY, gitActivity: { pull_requests: { total: 0, size_distribution: { xl: 0 } } } };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });
});
