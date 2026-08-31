import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/T3.pull-requests.js";
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

describe("T3.pull-requests — PR médiane fichiers > 12 (couches indisponibles)", () => {
  test("médiane 15 fichiers (> 12) → prouvée", () => {
    const ctx: ProfileContext = { ...EMPTY, pullRequests: pullRequests({ medianChangedFiles: { status: "ok", value: 15 } }) };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("médiane 5 fichiers (≤ 12) et couches non calculables → jamais infirmée par ce check (unknown, pas false)", () => {
    const ctx: ProfileContext = { ...EMPTY, pullRequests: pullRequests({ medianChangedFiles: { status: "ok", value: 5 } }) };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("source PR absente → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
