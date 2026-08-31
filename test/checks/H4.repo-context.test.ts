import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-repo-context/H4.repo-context.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import { judge } from "../../src/core/judge.js";
import type { Evidence, ProfileContext } from "../../src/core/types.js";
import type { RepoContextArtifact } from "../../src/sources/repo-context.js";
import gaCheck from "../../src/checks/core-git-activity/H4.git-activity.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function art(category: "regle" | "skill" | "agent", specific = true): RepoContextArtifact {
  return {
    relPath: `repo-context/.claude/${category}s/x.md`,
    category,
    lineCount: 20,
    specific,
    specificityHints: specific ? ["path_plausible", "long_enough"] : [],
    used: false,
    usageHints: [],
  };
}

describe("H4.repo-context — RC.behavior_artifacts_specific_count ≥ 1 (règle/skill/agent/prompt spécifiques)", () => {
  test("0 règle mais 4 skills + 2 agents spécifiques → prouvée", () => {
    const artifacts = [
      ...Array.from({ length: 4 }, () => art("skill")),
      ...Array.from({ length: 2 }, () => art("agent")),
    ];
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
  });

  test("RC fourni sans aucun artefact spécifique → infirmée (RC seul)", () => {
    const ctx: ProfileContext = { ...EMPTY, repoContext: { artifacts: [] } };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("repoContext absent → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});

describe("H4 — cas mixte multi-source (RC prouve, GA infirme) : la précédence RC > GA du juge évite l'infirmation à tort", () => {
  test("GA.context_files tout à zéro (contre-preuve GA) MAIS RC trouve un artefact spécifique (preuve RC) → H4 reste prouvée après jugement", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { context_files: { agents_md: false, rules_count: 0, skills_count: 0, hooks_count: 0, agents_count: 0 } },
      repoContext: { artifacts: [art("skill")] },
    };
    const gaEvidence = gaCheck.run(ctx, referentiel);
    const rcEvidence = check.run(ctx, referentiel);
    expect(gaEvidence[0]?.polarite).toBe("contre-preuve");
    expect(rcEvidence[0]?.polarite).toBe("preuve");

    const allEvidence: Evidence[] = [...gaEvidence, ...rcEvidence];
    const result = judge({
      referentiel,
      evidence: allEvidence,
      hasAiUsageProof: true,
      referenceSourcesPresentes: new Set(["GA", "RC"]),
    });
    const hVerdict = result.verdicts.find((v) => v.axe === "H");
    const h4State = hVerdict?.etats.find((e) => e.marche === "H4");
    expect(h4State?.etat).toBe("prouvé");
  });

  test("GA.context_files tout à zéro ET RC ne trouve rien → H4 réellement infirmée (les deux sources concordent)", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      gitActivity: { context_files: { agents_md: false, rules_count: 0, skills_count: 0, hooks_count: 0, agents_count: 0 } },
      repoContext: { artifacts: [] },
    };
    const gaEvidence = gaCheck.run(ctx, referentiel);
    const rcEvidence = check.run(ctx, referentiel);
    const allEvidence: Evidence[] = [...gaEvidence, ...rcEvidence];
    const result = judge({
      referentiel,
      evidence: allEvidence,
      hasAiUsageProof: true,
      referenceSourcesPresentes: new Set(["GA", "RC"]),
    });
    const hVerdict = result.verdicts.find((v) => v.axe === "H");
    const h4State = hVerdict?.etats.find((e) => e.marche === "H4");
    expect(h4State?.etat).toBe("infirmé");
  });
});
