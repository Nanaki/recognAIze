import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/T2.pull-requests.js";
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

describe("T2.pull-requests — PR médiane (5-12 fichiers OU 150-500 lignes)", () => {
  test("médiane 8 fichiers (dans [5;12]) → prouvée", () => {
    const ctx: ProfileContext = { ...EMPTY, pullRequests: pullRequests({ medianChangedFiles: { status: "ok", value: 8 } }) };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
    expect(evidence[0]?.source).toBe("PR");
  });

  test("médiane 20 fichiers et 600 lignes (PR plus GROSSE que la fenêtre M, pas plus petite) → aucune Evidence, jamais de contre-preuve", () => {
    // La contre-preuve documentée par referentiel.json pour T2 ("GA/PR médiane ≤ S",
    // signal_id "GA.size_median") ne couvre que le cas "trop petit" ; ce check ne
    // contre-preuve donc jamais T2 (voir sa docstring). Une PR plus grosse que la
    // fenêtre M ne doit ni prouver, ni infirmer T2 via la voie PR — seule
    // T2.git-activity.ts (source GA) peut légitimement l'infirmer.
    const ctx: ProfileContext = {
      ...EMPTY,
      pullRequests: pullRequests({
        medianChangedFiles: { status: "ok", value: 20 },
        medianLinesChanged: { status: "ok", value: 600 },
      }),
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("médiane 2 fichiers et 40 lignes (PR plus PETITE que la fenêtre M) → aucune Evidence non plus (contre-preuve réservée à T2.git-activity.ts)", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      pullRequests: pullRequests({
        medianChangedFiles: { status: "ok", value: 2 },
        medianLinesChanged: { status: "ok", value: 40 },
      }),
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("source PR absente → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });

  test("dénominateur nul (aucune PR mergée dans la fenêtre) → aucune Evidence, jamais de NaN", () => {
    const ctx: ProfileContext = { ...EMPTY, pullRequests: pullRequests({}) };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });
});
