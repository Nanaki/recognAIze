import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-repo-context/H3.repo-context.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { RepoContextArtifact } from "../../src/sources/repo-context.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function memoryFile(name: string, specific = true): RepoContextArtifact {
  return {
    relPath: `repo-context/docs/context/${name}`,
    category: "memoire",
    lineCount: 20,
    specific,
    specificityHints: specific ? ["path_plausible", "long_enough"] : [],
    used: false,
    usageHints: [],
  };
}

function ctxWith(artifacts: readonly RepoContextArtifact[], lastUpdated: string | null | undefined): ProfileContext {
  return {
    ...EMPTY,
    repoContext: { artifacts },
    gitActivity: {
      period: { from: "2026-01-01", to: "2026-12-31" },
      context_files: { last_updated: lastUpdated },
    },
  };
}

describe("H3.repo-context — RC.memory_files_specific_count ≥ 2 ET alive (GA.context_files.last_updated dans la fenêtre)", () => {
  test("3 fichiers spécifiques, last_updated dans la fenêtre → prouvée", () => {
    const artifacts = [memoryFile("architecture.md"), memoryFile("conventions.md"), memoryFile("glossary.md")];
    const evidence = check.run(ctxWith(artifacts, "2026-06-01"), referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("last_updated null → inconnue, sans erreur, ni prouvée ni infirmée", () => {
    const artifacts = [memoryFile("architecture.md"), memoryFile("conventions.md"), memoryFile("glossary.md")];
    expect(check.run(ctxWith(artifacts, null), referentiel)).toEqual([]);
  });

  test("last_updated non-ISO → inconnue, sans erreur", () => {
    const artifacts = [memoryFile("architecture.md"), memoryFile("conventions.md"), memoryFile("glossary.md")];
    expect(check.run(ctxWith(artifacts, "pas une date"), referentiel)).toEqual([]);
  });

  test("last_updated absent (undefined) → inconnue", () => {
    const artifacts = [memoryFile("architecture.md"), memoryFile("conventions.md"), memoryFile("glossary.md")];
    expect(check.run(ctxWith(artifacts, undefined), referentiel)).toEqual([]);
  });

  // Seuil calé sur les étalons : arthur n'a qu'un seul fichier docs/context/
  // jugé spécifique par le détecteur, avec GA.agents_md déjà maintenu dans la
  // fenêtre. referentiel.json.H3.p1 exige donc ≥ 1 fichier spécifique et
  // vivant, pas ≥ 2.
  test("1 fichier spécifique, last_updated dans la fenêtre → prouvée (seuil réglé à ≥ 1)", () => {
    const artifacts = [memoryFile("architecture.md")];
    const evidence = check.run(ctxWith(artifacts, "2026-06-01"), referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("0 fichier spécifique, même avec last_updated dans la fenêtre → infirmée (compte insuffisant l'emporte)", () => {
    const artifacts: RepoContextArtifact[] = [memoryFile("architecture.md", false)];
    const evidence = check.run(ctxWith(artifacts, "2026-06-01"), referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("1 fichier spécifique mais last_updated hors fenêtre → infirmée", () => {
    const artifacts = [memoryFile("architecture.md")];
    const evidence = check.run(ctxWith(artifacts, "2020-01-01"), referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("repoContext absent → aucune Evidence", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { period: { from: "2026-01-01", to: "2026-12-31" }, context_files: { last_updated: "2026-06-01" } },
    };
    expect(check.run(ctx, referentiel)).toEqual([]);
  });
});
