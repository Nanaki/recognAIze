import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/O2.git-activity.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("O2.git-activity — prs_with_tests_ratio ≥ 0,5 ET coverage_end ≥ coverage_start − 0,02", () => {
  test("ratio = 0,5 (seuil exact) et couverture stable → prouvée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { tests: { prs_with_tests_ratio: 0.5, coverage_start: 0.8, coverage_end: 0.8 } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("ratio < 0,5 → infirmée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { tests: { prs_with_tests_ratio: 0.3, coverage_start: 0.8, coverage_end: 0.8 } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("ratio ≥ 0,5 mais couverture en baisse de plus de 0,02 → infirmée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { tests: { prs_with_tests_ratio: 0.9, coverage_start: 0.8, coverage_end: 0.7 } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("baisse de couverture ≤ 0,02 (tolérance) → n'infirme pas ce critère", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { tests: { prs_with_tests_ratio: 0.9, coverage_start: 0.8, coverage_end: 0.79 } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("champs absents → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
