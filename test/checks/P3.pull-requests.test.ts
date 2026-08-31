import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/P3.pull-requests.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { PullRequestsData } from "../../src/sources/pull-requests.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function pullRequests(overrides: Partial<PullRequestsData>): PullRequestsData {
  return {
    totalEntries: 1,
    mergedInWindowCount: 1,
    medianChangedFiles: { status: "unknown", reason: "dénominateur nul" },
    medianLinesChanged: { status: "unknown", reason: "dénominateur nul" },
    medianReviewComments: { status: "unknown", reason: "dénominateur nul" },
    medianCreatedToMergedDays: { status: "unknown", reason: "dénominateur nul" },
    structuredBodyRatio: { status: "unknown", reason: "dénominateur nul" },
    ...overrides,
  };
}

describe("P3.pull-requests — PR recouvrement médian (created→merged) ≥ 3", () => {
  test("recouvrement médian = 3 (seuil exact) → prouvée", () => {
    const ctx: ProfileContext = { ...EMPTY, pullRequests: pullRequests({ medianCreatedToMergedDays: { status: "ok", value: 3 } }) };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("recouvrement médian = 2 (< 3) → infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, pullRequests: pullRequests({ medianCreatedToMergedDays: { status: "ok", value: 2 } }) };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("source PR absente → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
