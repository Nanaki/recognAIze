import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/I2.git-activity.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function ctxWith(medianCorrection: number): ProfileContext {
  return { ...EMPTY, gitActivity: { pull_requests: { median_correction_commits_after_open: medianCorrection } } };
}

describe("I2.git-activity — GA.median_correction_commits_after_open ≤ 3", () => {
  test.for([1, 2, 3])("valeur %i (≤ 3) → I2 prouvée", (value) => {
    const evidence = check.run(ctxWith(value), referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("valeur 4 (> 3) → I2 infirmée", () => {
    const evidence = check.run(ctxWith(4), referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("champ absent → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
