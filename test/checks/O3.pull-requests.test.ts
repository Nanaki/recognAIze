import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/O3.pull-requests.js";
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

describe("O3.pull-requests — PR.structured_body_ratio ≥ 0,5", () => {
  test("ratio = 0,5 (seuil exact) → prouvée", () => {
    const ctx: ProfileContext = { ...EMPTY, pullRequests: pullRequests({ structuredBodyRatio: { status: "ok", value: 0.5 } }) };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("ratio < 0,5 → infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, pullRequests: pullRequests({ structuredBodyRatio: { status: "ok", value: 0.2 } }) };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("dénominateur nul (aucun body non nul) → aucune Evidence", () => {
    const ctx: ProfileContext = { ...EMPTY, pullRequests: pullRequests({}) };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("source PR absente → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
