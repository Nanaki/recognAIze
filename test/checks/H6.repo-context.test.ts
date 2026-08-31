import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-repo-context/H6.repo-context.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { RepoContextArtifact } from "../../src/sources/repo-context.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function specificHook(): RepoContextArtifact {
  return {
    relPath: "repo-context/.claude/hooks/retry-until-green.sh",
    category: "hook",
    lineCount: 30,
    specific: true,
    specificityHints: ["path_plausible", "long_enough"],
    used: false,
    usageHints: [],
  };
}

/** `docs/brainstorm/auto-retry.md` — prose décrivant une boucle jamais faite. `docs/brainstorm/` n'est PAS dans les emplacements
 * connus de `sources/repo-context.ts` : il n'est donc jamais inventorié, jamais classé "hook" — ce fragment
 * de test représente donc fidèlement le scénario en construisant un RC SANS aucun artefact hook, exactement ce que produirait
 * réellement `loadRepoContext` sur un profil ne contenant QUE ce document de prose (plus, ici, un fichier d'identité neutre,
 * pour prouver que RC est bien "fourni" et non absent). */
describe("H6.repo-context — RC.loop_artifact_executable : un document décrivant une boucle n'est JAMAIS une preuve", () => {
  test("hook exécutable spécifique (.claude/hooks/retry-until-green.sh) → prouvée", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [specificHook()] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("docs/brainstorm/auto-retry.md (prose décrivant une boucle, jamais outillée) → infirmée, jamais prouvée", () => {
    // `docs/brainstorm/` n'étant jamais inventorié par `repo-context.ts`, un tel document
    // n'apparaît structurellement jamais dans `artifacts` — RC fourni (via l'identité), sans hook.
    const ctx: ProfileContext = {
      ...EMPTY,
      repoContext: {
        artifacts: [
          {
            relPath: "repo-context/AGENTS.md",
            category: "identite",
            lineCount: 10,
            specific: true,
            specificityHints: ["long_enough"],
            used: false,
            usageHints: [],
          },
        ],
      },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("hook présent mais NON spécifique (placeholder) → infirmée, pas prouvée (H6 plus strict que H5)", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      repoContext: {
        artifacts: [
          {
            relPath: "repo-context/.claude/hooks/x.sh",
            category: "hook",
            lineCount: 1,
            specific: false,
            specificityHints: [],
            used: false,
            usageHints: [],
          },
        ],
      },
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("repoContext absent → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
