import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/H3.git-activity.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };
const PERIOD = { from: "2026-01-01", to: "2026-06-01" };

describe("H3.git-activity — GA.agents_md ET last_updated dans la fenêtre", () => {
  test("agents_md = true, last_updated dans la fenêtre (period) → prouvée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { period: PERIOD, context_files: { agents_md: true, last_updated: "2026-03-15" } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("last_updated hors fenêtre → ni prouvée ni infirmée (pas all-zero)", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { period: PERIOD, context_files: { agents_md: true, last_updated: "2020-01-01" } },
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("last_updated null → inconnue (aucune Evidence), sans erreur", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { period: PERIOD, context_files: { agents_md: true, last_updated: null } },
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("context_files tous à zéro → infirmée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: {
        period: PERIOD,
        context_files: { agents_md: false, rules_count: 0, skills_count: 0, hooks_count: 0, agents_count: 0, last_updated: null },
      },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("champs absents → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
