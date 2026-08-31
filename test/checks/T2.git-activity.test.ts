import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-git-activity/T2.git-activity.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("T2.git-activity — GA.size_median ≥ M", () => {
  test("size_distribution {xs:4,s:12,m:24,l:7,xl:1} (médiane M) → T2 prouvée, valeur observée + seuil dans la citation", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { total: 48, size_distribution: { xs: 4, s: 12, m: 24, l: 7, xl: 1 } } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
    expect(evidence[0]?.path_id).toBe("T2.p1");
    expect(evidence[0]?.citation).toContain("GA.size_median=m");
    expect(evidence[0]?.citation).toContain("≥ M");
  });

  test("médiane S (seuil − 1 classe) → contre-preuve", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { total: 1, size_distribution: { s: 1 } } },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("champ absent (aucun gitActivity) → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });

  test("somme des classes ≠ total déclaré → médiane inconnue → aucune Evidence", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { pull_requests: { total: 999, size_distribution: { xs: 4, s: 12, m: 24, l: 7, xl: 1 } } },
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });
});
