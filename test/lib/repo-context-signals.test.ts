import { describe, expect, test } from "vitest";

import {
  approvalGatePresent,
  behaviorArtifactsSpecificCount,
  capitalizationArtifactSpecificCount,
  evalsOrTrustTierPresentForH,
  evalsVersionedPresent,
  guardrailArtifactPresent,
  identityFileSpecific,
  loopArtifactExecutable,
  memoryFilesSpecificCount,
  multiAgentOrchestratorCount,
  reviewAgentPresent,
  trustTierOrCircuitBreakerPresent,
} from "../../src/lib/repo-context-signals.js";
import type { ArtifactCategory, RepoContextArtifact, RepoContextData } from "../../src/sources/repo-context.js";

function artifact(overrides: Partial<RepoContextArtifact> & { readonly category: ArtifactCategory }): RepoContextArtifact {
  return {
    relPath: `repo-context/${overrides.category}/x.md`,
    lineCount: 5,
    specific: false,
    specificityHints: [],
    used: false,
    usageHints: [],
    ...overrides,
  };
}

function rc(artifacts: readonly RepoContextArtifact[]): RepoContextData {
  return { artifacts };
}

describe("repo-context-signals — absence de RC ⇒ undefined partout", () => {
  test("toutes les fonctions rendent undefined si repoContext est absent", () => {
    expect(identityFileSpecific(undefined)).toBeUndefined();
    expect(memoryFilesSpecificCount(undefined)).toBeUndefined();
    expect(behaviorArtifactsSpecificCount(undefined)).toBeUndefined();
    expect(guardrailArtifactPresent(undefined)).toBeUndefined();
    expect(loopArtifactExecutable(undefined)).toBeUndefined();
    expect(multiAgentOrchestratorCount(undefined)).toBeUndefined();
    expect(evalsOrTrustTierPresentForH(undefined)).toBeUndefined();
    expect(capitalizationArtifactSpecificCount(undefined)).toBeUndefined();
    expect(reviewAgentPresent(undefined)).toBeUndefined();
    expect(approvalGatePresent(undefined)).toBeUndefined();
    expect(evalsVersionedPresent(undefined)).toBeUndefined();
    expect(trustTierOrCircuitBreakerPresent(undefined)).toBeUndefined();
  });

  test("RC fourni mais artifacts vide ⇒ false/0 (regardé, rien trouvé), jamais undefined", () => {
    const empty = rc([]);
    expect(identityFileSpecific(empty)).toBe(false);
    expect(memoryFilesSpecificCount(empty)).toBe(0);
    expect(behaviorArtifactsSpecificCount(empty)).toBe(0);
    expect(guardrailArtifactPresent(empty)).toBe(false);
    expect(loopArtifactExecutable(empty)).toBe(false);
    expect(multiAgentOrchestratorCount(empty)).toBe(0);
    expect(evalsOrTrustTierPresentForH(empty)).toBe(false);
    expect(capitalizationArtifactSpecificCount(empty)).toBe(0);
  });
});

describe("identityFileSpecific — H2", () => {
  test("identité spécifique présente ⇒ true", () => {
    expect(identityFileSpecific(rc([artifact({ category: "identite", specific: true })]))).toBe(true);
  });
  test("identité présente mais non spécifique ⇒ false", () => {
    expect(identityFileSpecific(rc([artifact({ category: "identite", specific: false })]))).toBe(false);
  });
});

describe("behaviorArtifactsSpecificCount — H4 (règle/skill/agent/prompt spécifiques)", () => {
  test("0 règle, 4 skills, 2 agents (tous spécifiques) ⇒ 6", () => {
    const artifacts = [
      ...Array.from({ length: 4 }, () => artifact({ category: "skill", specific: true })),
      ...Array.from({ length: 2 }, () => artifact({ category: "agent", specific: true })),
    ];
    expect(behaviorArtifactsSpecificCount(rc(artifacts))).toBe(6);
  });
  test("capitalisation n'est jamais comptée (exclusion axe H)", () => {
    expect(behaviorArtifactsSpecificCount(rc([artifact({ category: "capitalisation", specific: true })]))).toBe(0);
  });
  test("artefacts non spécifiques ne comptent pas", () => {
    expect(behaviorArtifactsSpecificCount(rc([artifact({ category: "skill", specific: false })]))).toBe(0);
  });
});

describe("guardrailArtifactPresent — H5 (présence seule, pas de spécificité requise)", () => {
  test("deny-list présente (settings.json), non spécifique ⇒ true", () => {
    expect(guardrailArtifactPresent(rc([artifact({ category: "deny-list", specific: false })]))).toBe(true);
  });
  test("hook présent ⇒ true", () => {
    expect(guardrailArtifactPresent(rc([artifact({ category: "hook", specific: false })]))).toBe(true);
  });
  test("aucun hook/deny-list ⇒ false", () => {
    expect(guardrailArtifactPresent(rc([artifact({ category: "identite" })]))).toBe(false);
  });
});

describe("loopArtifactExecutable — H6 (hook SPÉCIFIQUE requis ET nom suggérant une boucle de relance, plus strict que H5)", () => {
  test("hook spécifique nommé retry-until-green.sh ⇒ true", () => {
    expect(
      loopArtifactExecutable(rc([artifact({ category: "hook", specific: true, relPath: "repo-context/.claude/hooks/retry-until-green.sh" })])),
    ).toBe(true);
  });
  test("hook présent mais non spécifique ⇒ false (H5 le prouverait, pas H6)", () => {
    expect(loopArtifactExecutable(rc([artifact({ category: "hook", specific: false, relPath: "repo-context/.claude/hooks/retry-until-green.sh" })]))).toBe(
      false,
    );
  });
  // Un hook SPÉCIFIQUE dont le nom ne suggère aucune boucle de relance (ex.
  // un simple lint de garde-fou, une seule passe, jamais de relance) ne
  // prouve pas H6 — cas réel sur la fixture négative `leodagan`, dont
  // `.claude/hooks/check-assertions.js` est un hook spécifique mais un
  // garde-fou à passage unique, pas une boucle.
  test("hook spécifique mais nom sans motif de boucle (ex. check-assertions.js) ⇒ false", () => {
    expect(
      loopArtifactExecutable(rc([artifact({ category: "hook", specific: true, relPath: "repo-context/.claude/hooks/check-assertions.js" })])),
    ).toBe(false);
  });
  test("document de prose classé ailleurs (ex. capitalisation) ⇒ false, jamais un artefact exécutable", () => {
    expect(
      loopArtifactExecutable(rc([artifact({ category: "capitalisation", specific: true, relPath: "repo-context/capitalisation/retry-loop.md" })])),
    ).toBe(false);
  });
});

// Cette fonction rend le COMPTE brut, jamais un booléen déjà comparé à un
// seuil en dur ici — un seuil en dur serait invisible à
// `evals/anti-literal.ts`. Le seuil `>= 2` vit dans `src/referentiel.json`
// (`thresholds["H7.p1"]`), testé par `test/checks/H7.repo-context.test.ts`,
// pas ici.
describe("multiAgentOrchestratorCount — H7 (compte brut d'agents spécifiques, seuil >= 2 dans referentiel.json)", () => {
  test("1 agent spécifique ⇒ 1", () => {
    expect(multiAgentOrchestratorCount(rc([artifact({ category: "agent", specific: true })]))).toBe(1);
  });
  test("2 agents spécifiques ⇒ 2", () => {
    expect(
      multiAgentOrchestratorCount(
        rc([artifact({ category: "agent", specific: true }), artifact({ category: "agent", specific: true })]),
      ),
    ).toBe(2);
  });
});

describe("evalsOrTrustTierPresentForH — H7, exclut capitalisation", () => {
  test("fichier 'evals/regression.md' sous skill (non capitalisation) ⇒ true", () => {
    expect(
      evalsOrTrustTierPresentForH(rc([artifact({ category: "skill", relPath: "repo-context/.claude/skills/evals/regression.md" })])),
    ).toBe(true);
  });
  test("fichier 'evals.md' sous capitalisation ⇒ false (exclu de l'axe H)", () => {
    expect(
      evalsOrTrustTierPresentForH(rc([artifact({ category: "capitalisation", relPath: "repo-context/docs/plans/evals.md" })])),
    ).toBe(false);
  });
  test("trust-tier.md sous prompt ⇒ true", () => {
    expect(
      evalsOrTrustTierPresentForH(rc([artifact({ category: "prompt", relPath: "repo-context/.github/prompts/trust-tier.md" })])),
    ).toBe(true);
  });
});

describe("capitalizationArtifactSpecificCount — O3, capitalisation compte (axe Ownership)", () => {
  test("2 artefacts capitalisation spécifiques ⇒ 2", () => {
    expect(
      capitalizationArtifactSpecificCount(
        rc([artifact({ category: "capitalisation", specific: true }), artifact({ category: "capitalisation", specific: true })]),
      ),
    ).toBe(2);
  });
});

describe("reviewAgentPresent / approvalGatePresent — O4", () => {
  test("agent spécifique nommé 'code-review' ⇒ reviewAgentPresent true", () => {
    expect(reviewAgentPresent(rc([artifact({ category: "agent", specific: true, relPath: "repo-context/.claude/agents/code-review.md" })]))).toBe(
      true,
    );
  });
  test("agent spécifique sans motif 'review' dans le nom ⇒ false", () => {
    expect(reviewAgentPresent(rc([artifact({ category: "agent", specific: true, relPath: "repo-context/.claude/agents/builder.md" })]))).toBe(
      false,
    );
  });
  test("approvalGatePresent réutilise guardrailArtifactPresent (deny-list)", () => {
    expect(approvalGatePresent(rc([artifact({ category: "deny-list" })]))).toBe(true);
  });
});

describe("evalsVersionedPresent / trustTierOrCircuitBreakerPresent — O5, capitalisation autorisée", () => {
  test("evals sous capitalisation ⇒ true (O5 n'exclut pas capitalisation)", () => {
    expect(evalsVersionedPresent(rc([artifact({ category: "capitalisation", relPath: "repo-context/docs/plans/evals-2026.md" })]))).toBe(
      true,
    );
  });
  test("circuit-breaker.md ⇒ trust tier présent", () => {
    expect(
      trustTierOrCircuitBreakerPresent(rc([artifact({ category: "hook", relPath: "repo-context/.claude/hooks/circuit-breaker.sh" })])),
    ).toBe(true);
  });
  test("aucun motif ⇒ false", () => {
    expect(trustTierOrCircuitBreakerPresent(rc([artifact({ category: "hook", relPath: "repo-context/.claude/hooks/pre-commit.sh" })]))).toBe(
      false,
    );
  });
});
