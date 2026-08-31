import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/I4.git-activity.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("I4.git-activity — voie de repli (pull-requests.json absent), dénominateur = pull_requests.total", () => {
  test("merged_without_human_edit_after_open=37, pull_requests.total=71 (sans pullRequests) → dénominateur 71, citation « approximation »", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: {
        pull_requests: { merged_without_human_edit_after_open: 37, total: 71 },
        commits: { ai_coauthored_ratio: 0.95 },
      },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.citation).toContain("37/71");
    expect(evidence[0]?.citation).toContain("approximation");
  });

  test("jamais actif quand pull-requests.json est présent (même vide)", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { merged_without_human_edit_after_open: 37, total: 71 }, commits: { ai_coauthored_ratio: 0.95 } },
      pullRequests: {
        totalEntries: 0,
        mergedInWindowCount: 0,
        medianChangedFiles: { status: "unknown", reason: "dénominateur nul" },
        medianLinesChanged: { status: "unknown", reason: "dénominateur nul" },
        medianReviewComments: { status: "unknown", reason: "dénominateur nul" },
        medianCreatedToMergedDays: { status: "unknown", reason: "dénominateur nul" },
        structuredBodyRatio: { status: "unknown", reason: "dénominateur nul" },
      },
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("ratio ≥ 0,8 et ai_coauthored_ratio ≥ 0,9 → prouvée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { merged_without_human_edit_after_open: 8, total: 10 }, commits: { ai_coauthored_ratio: 0.9 } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("ratio < 0,8 → infirmée", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { merged_without_human_edit_after_open: 1, total: 10 }, commits: { ai_coauthored_ratio: 0.95 } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("pull_requests.total = 0 → aucune Evidence, raison « dénominateur nul », jamais de NaN", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { merged_without_human_edit_after_open: 0, total: 0 }, commits: { ai_coauthored_ratio: 0.5 } },
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("champs absents → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
