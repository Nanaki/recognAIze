import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-repo-context/H2.repo-context.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { RepoContextArtifact } from "../../src/sources/repo-context.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function identity(specific: boolean): RepoContextArtifact {
  return {
    relPath: "repo-context/AGENTS.md",
    category: "identite",
    lineCount: 20,
    specific,
    specificityHints: specific ? ["path_plausible", "long_enough"] : [],
    used: false,
    usageHints: [],
  };
}

describe("H2.repo-context — RC.identity_file_specific, contre-preuve = négation complète (RC fourni sans fichier d'identité)", () => {
  test("identité spécifique présente → prouvée", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [identity(true)] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
    expect(evidence[0]?.force).toBe("prouve");
  });

  test("RC fourni, artifacts vide → infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("RC fourni, identité présente mais non spécifique → infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [identity(false)] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("repoContext absent → aucune Evidence (jamais infirmée par défaut)", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
