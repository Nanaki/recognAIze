import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-repo-context/O2.sonar.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("O2.sonar — NO-OP délibéré : le badge qualité n'est jamais une Evidence", () => {
  test("path_ids déclaré vide", () => {
    expect(check.path_ids).toEqual([]);
  });

  test("run() ne produit jamais d'Evidence, quel que soit le contexte", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
    const ctx: ProfileContext = {
      ...EMPTY,
      sonarMeasures: { measures: { bugs: 0, duplicated_lines_density: 0.02 } },
      gitActivity: { tests: { coverage_start: 0.8, coverage_end: 0.8 }, ci: { failure_rate: 0.1 } },
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });
});
