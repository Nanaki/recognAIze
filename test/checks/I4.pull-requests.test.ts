import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/I4.pull-requests.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { PullRequestsData } from "../../src/sources/pull-requests.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function pullRequests(overrides: Partial<PullRequestsData>): PullRequestsData {
  return {
    totalEntries: 0,
    mergedInWindowCount: 0,
    medianChangedFiles: { status: "unknown", reason: "dénominateur nul" },
    medianLinesChanged: { status: "unknown", reason: "dénominateur nul" },
    medianReviewComments: { status: "unknown", reason: "dénominateur nul" },
    medianCreatedToMergedDays: { status: "unknown", reason: "dénominateur nul" },
    structuredBodyRatio: { status: "unknown", reason: "dénominateur nul" },
    ...overrides,
  };
}

describe("I4.pull-requests — voie précise (pull-requests.json présent), dénominateur = PR mergées dans la fenêtre", () => {
  test("merged_without_human_edit_after_open=37, pull_requests.total=71, 40 PR mergées dans la fenêtre → dénominateur 40, pas 71", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { merged_without_human_edit_after_open: 37, total: 71 }, commits: { ai_coauthored_ratio: 0.95 } },
      pullRequests: pullRequests({ mergedInWindowCount: 40 }),
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.citation).toContain("37/40");
    expect(evidence[0]?.citation).not.toContain("37/71");
    expect(evidence[0]?.source).toBe("PR");
  });

  test("jamais actif quand pull-requests.json est absent", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { merged_without_human_edit_after_open: 37, total: 71 }, commits: { ai_coauthored_ratio: 0.95 } },
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("mergedInWindowCount = 0 → aucune Evidence, jamais de NaN", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { merged_without_human_edit_after_open: 0, total: 71 }, commits: { ai_coauthored_ratio: 0.95 } },
      pullRequests: pullRequests({ mergedInWindowCount: 0 }),
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });
});
