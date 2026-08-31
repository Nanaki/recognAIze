import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/I5.pull-requests.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("I5.pull-requests — NO-OP assumé (recognaize.config.json non câblé dans ce run)", () => {
  test("contexte vide → aucune Evidence (inconnue, jamais infirmée par défaut)", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });

  test("contexte riche (PR présent) → toujours aucune Evidence", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      pullRequests: {
        totalEntries: 5,
        mergedInWindowCount: 5,
        medianChangedFiles: { status: "ok", value: 3 },
        medianLinesChanged: { status: "ok", value: 100 },
        medianReviewComments: { status: "ok", value: 1 },
        medianCreatedToMergedDays: { status: "ok", value: 1 },
        structuredBodyRatio: { status: "ok", value: 1 },
      },
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });

  test("déclare path_ids: [\"I5.p1\"] pour que le registre ne le signale pas orpheline", () => {
    expect(check.path_ids).toEqual(["I5.p1"]);
    expect(check.enabled).toBe(true);
  });
});
