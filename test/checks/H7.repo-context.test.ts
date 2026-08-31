import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-repo-context/H7.repo-context.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { RepoContextArtifact } from "../../src/sources/repo-context.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function agent(name: string): RepoContextArtifact {
  return {
    relPath: `repo-context/.claude/agents/${name}.md`,
    category: "agent",
    lineCount: 20,
    specific: true,
    specificityHints: ["path_plausible", "long_enough"],
    used: false,
    usageHints: [],
  };
}

function evalsSkill(): RepoContextArtifact {
  return {
    relPath: "repo-context/.claude/skills/evals-suite.md",
    category: "skill",
    lineCount: 10,
    specific: true,
    specificityHints: [],
    used: false,
    usageHints: [],
  };
}

describe("H7.repo-context — orchestrateur multi-agents ET (evals OU trust tiers), les DEUX requis", () => {
  test("2 agents spécifiques ET evals → prouvée", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [agent("planner"), agent("implementer"), evalsSkill()] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("2 agents spécifiques SEULS, sans evals/trust tier → infirmée (les deux conditions requises)", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [agent("planner"), agent("implementer")] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("evals seuls, sans orchestrateur multi-agents → infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [evalsSkill()] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("repoContext absent → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
