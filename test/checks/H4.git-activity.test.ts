import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/H4.git-activity.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("H4.git-activity — GA.rules_count + skills_count + agents_count ≥ 1", () => {
  test("0 règle mais 4 skills et 2 agents → prouvée", () => {
    const ctx: ProfileContext = { ...EMPTY, gitActivity: { context_files: { rules_count: 0, skills_count: 4, agents_count: 2 } } };
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

  test("champs absents → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
