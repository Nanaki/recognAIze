import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/H5.git-activity.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("H5.git-activity — GA.hooks_count ≥ 1", () => {
  test("hooks_count = 1 (seuil exact) → prouvée", () => {
    const ctx: ProfileContext = { ...EMPTY, gitActivity: { context_files: { hooks_count: 1 } } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("context_files tous à zéro → infirmée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { context_files: { agents_md: false, rules_count: 0, skills_count: 0, hooks_count: 0, agents_count: 0 } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("hooks_count = 0 mais d'autres compteurs non nuls → ni prouvée ni infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, gitActivity: { context_files: { hooks_count: 0, rules_count: 3 } } };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("champs absents → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
