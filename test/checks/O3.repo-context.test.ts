import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-repo-context/O3.repo-context.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { RepoContextArtifact } from "../../src/sources/repo-context.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function capitalization(relPath: string): RepoContextArtifact {
  return {
    relPath: `repo-context/${relPath}`,
    category: "capitalisation",
    lineCount: 20,
    specific: true,
    specificityHints: ["path_plausible", "long_enough"],
    used: false,
    usageHints: [],
  };
}

describe("O3.repo-context — docs/plans, docs/specs, docs/decisions/adr, aidd_docs/tasks comptent, jamais pour H", () => {
  test("docs/plans/ + docs/specs/ + docs/decisions/ (3 artefacts capitalisation spécifiques) → prouvée", () => {
    const artifacts = [
      capitalization("docs/plans/migration.md"),
      capitalization("docs/specs/stripe-v2.md"),
      capitalization("docs/decisions/adr-001.md"),
    ];
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("RC fourni sans artefact de capitalisation → infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("repoContext absent → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
