import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/I3.git-activity.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function ctxWith(medianCorrection: number): ProfileContext {
  return { ...EMPTY, gitActivity: { pull_requests: { median_correction_commits_after_open: medianCorrection } } };
}

describe("I3.git-activity — GA.median_correction_commits_after_open ≤ 1", () => {
  test("valeur 1 (seuil exact) → I3 prouvée", () => {
    const evidence = check.run(ctxWith(1), referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test.for([2, 4])("valeur %i (> 1) → I3 infirmée", (value) => {
    const evidence = check.run(ctxWith(value), referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("champ absent → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
