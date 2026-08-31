import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-repo-context/O5.repo-context.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { RepoContextArtifact } from "../../src/sources/repo-context.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("O5.repo-context — RC.evals_versioned_present ET RC.trust_tier_or_circuit_breaker_present (les deux requis)", () => {
  test("evals + circuit-breaker (sous capitalisation, autorisé pour O5) → prouvée", () => {
    const artifacts: RepoContextArtifact[] = [
      {
        relPath: "repo-context/docs/plans/evals-2026.md",
        category: "capitalisation",
        lineCount: 10,
        specific: false,
        specificityHints: [],
        used: false,
        usageHints: [],
      },
      {
        relPath: "repo-context/.claude/hooks/circuit-breaker.sh",
        category: "hook",
        lineCount: 10,
        specific: false,
        specificityHints: [],
        used: false,
        usageHints: [],
      },
    ];
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("evals seuls, sans trust tier ni circuit breaker → infirmée", () => {
    const artifacts: RepoContextArtifact[] = [
      {
        relPath: "repo-context/docs/plans/evals-2026.md",
        category: "capitalisation",
        lineCount: 10,
        specific: false,
        specificityHints: [],
        used: false,
        usageHints: [],
      },
    ];
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("RC fourni sans evals → infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("repoContext absent → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
