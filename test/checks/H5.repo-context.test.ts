import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-repo-context/H5.repo-context.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { RepoContextArtifact } from "../../src/sources/repo-context.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function settingsJson(): RepoContextArtifact {
  return {
    relPath: "repo-context/.claude/settings.json",
    category: "deny-list",
    lineCount: 12,
    specific: false,
    specificityHints: [],
    used: false,
    usageHints: [],
  };
}

describe("H5.repo-context — RC.guardrail_artifact_present (présence seule, hook ou deny-list)", () => {
  test("settings.json (permissions.deny, classé deny-list) → prouvée, même non spécifique", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [settingsJson()] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("RC fourni sans hook ni deny-list → infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("repoContext absent → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
