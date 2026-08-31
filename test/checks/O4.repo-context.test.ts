import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-repo-context/O4.repo-context.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { RepoContextArtifact } from "../../src/sources/repo-context.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("O4.repo-context — RC.review_agent_present OU RC.approval_gate_present", () => {
  test("agent spécifique 'code-review.md' → prouvée (voie review agent)", () => {
    const artifacts: RepoContextArtifact[] = [
      {
        relPath: "repo-context/.claude/agents/code-review.md",
        category: "agent",
        lineCount: 20,
        specific: true,
        specificityHints: ["path_plausible", "long_enough"],
        used: false,
        usageHints: [],
      },
    ];
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("deny-list présente (settings.json) → prouvée (voie approval gate)", () => {
    const artifacts: RepoContextArtifact[] = [
      {
        relPath: "repo-context/.claude/settings.json",
        category: "deny-list",
        lineCount: 12,
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

  test("RC fourni sans reviewer ni gate → infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("repoContext absent → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
