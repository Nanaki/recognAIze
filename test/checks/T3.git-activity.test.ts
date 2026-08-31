import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/T3.git-activity.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("T3.git-activity — GA.size_median ≥ L", () => {
  test("size_distribution {xs:4,s:12,m:24,l:7,xl:1} (médiane M, seuil − 1 classe) → T3 infirmée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { total: 48, size_distribution: { xs: 4, s: 12, m: 24, l: 7, xl: 1 } } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
    expect(evidence[0]?.path_id).toBe("T3.p1");
  });

  test("médiane L (seuil exact) → T3 prouvée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { total: 1, size_distribution: { l: 1 } } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("champ absent → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
