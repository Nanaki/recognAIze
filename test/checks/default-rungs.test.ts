// Scénarios de preuve d'usage IA et marches par défaut (`T1/H1/I1/P1/O1`).
// Appelle `runAnalysis` directement (pas de spawn de `dist/cli.js`) : ce
// test-ci vérifie la logique, `test/e2e-jury.test.ts` couvre le binaire
// construit de bout en bout.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import h1Default from "../../src/checks/core-git-activity/H1.default.js";
import i1Default from "../../src/checks/core-git-activity/I1.default.js";
import o1Default from "../../src/checks/core-git-activity/O1.default.js";
import p1Default from "../../src/checks/core-git-activity/P1.default.js";
import t1Default from "../../src/checks/core-git-activity/T1.default.js";
import { runAnalysis } from "../../src/analyze.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import { hasAiUsageProof } from "../../src/lib/ai-usage-proof.js";

const TEST_FILE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "..", "..");

const FIXTURES_DIR = resolve(REPO_ROOT, "fixtures", "profiles");
const SYNTHETIC_NO_AI_TRACE_DIR = resolve(REPO_ROOT, "fixtures", "synthetic", "no-ai-trace");

const EMPTY_CONTEXT: ProfileContext = { profileId: "test", warnings: [] };

describe("hasAiUsageProof — détecteur outillé, jamais déclaratif", () => {
  test("contexte totalement vide -> false", () => {
    expect(hasAiUsageProof(EMPTY_CONTEXT)).toBe(false);
  });

  test("ai_coauthored_ratio > 0 -> true", () => {
    const ctx: ProfileContext = {
      ...EMPTY_CONTEXT,
      gitActivity: { commits: { ai_coauthored_ratio: 0.04 } },
    };
    expect(hasAiUsageProof(ctx)).toBe(true);
  });

  test("ai_coauthored_ratio === 0 -> ne compte pas seul", () => {
    const ctx: ProfileContext = {
      ...EMPTY_CONTEXT,
      gitActivity: { commits: { ai_coauthored_ratio: 0 } },
    };
    expect(hasAiUsageProof(ctx)).toBe(false);
  });

  test("artefact repo-context présent -> true", () => {
    const ctx: ProfileContext = {
      ...EMPTY_CONTEXT,
      repoContext: {
        artifacts: [
          {
            relPath: "repo-context/AGENTS.md",
            category: "identite",
            lineCount: 3,
            specific: true,
            specificityHints: [],
            used: false,
            usageHints: [],
          },
        ],
      },
    };
    expect(hasAiUsageProof(ctx)).toBe(true);
  });

  test("repo-context présent mais vide (aucun artefact) -> ne compte pas seul", () => {
    const ctx: ProfileContext = { ...EMPTY_CONTEXT, repoContext: { artifacts: [] } };
    expect(hasAiUsageProof(ctx)).toBe(false);
  });

  test("session digest non vide (turnCount > 0) -> true", () => {
    const ctx: ProfileContext = {
      ...EMPTY_CONTEXT,
      session: { turnCount: 2, convention: "bold_header", toolCalls: [], excerpt: "x", truncated: false },
    };
    expect(hasAiUsageProof(ctx)).toBe(true);
  });

  test("session digest vide (turnCount === 0) -> ne compte pas seul", () => {
    const ctx: ProfileContext = {
      ...EMPTY_CONTEXT,
      session: { turnCount: 0, convention: "unrecognized", toolCalls: [], excerpt: "", truncated: false },
    };
    expect(hasAiUsageProof(ctx)).toBe(false);
  });

  test("assistant_usage.sessions_per_week > 0 -> true", () => {
    const ctx: ProfileContext = {
      ...EMPTY_CONTEXT,
      gitActivity: { assistant_usage: { sessions_per_week: 3 } },
    };
    expect(hasAiUsageProof(ctx)).toBe(true);
  });

  test("assistant_usage.sessions_per_week === 0 -> ne compte pas seul", () => {
    const ctx: ProfileContext = {
      ...EMPTY_CONTEXT,
      gitActivity: { assistant_usage: { sessions_per_week: 0 } },
    };
    expect(hasAiUsageProof(ctx)).toBe(false);
  });

  test("le déclaratif seul (DEC) ne prouve jamais rien, même en cas de réponse explicite", () => {
    const ctx: ProfileContext = {
      ...EMPTY_CONTEXT,
      declaratif: {
        answered: true,
        qas: [{ question: "Utilises-tu un assistant IA ?", answer: "Oui, tous les jours." }],
        symptoms: [],
        negativeHints: [],
      },
    };
    expect(hasAiUsageProof(ctx)).toBe(false);
  });
});

describe("les 5 marches par défaut (T1/H1/I1/P1/O1) — checks NO-OP", () => {
  const defaults = [t1Default, h1Default, i1Default, p1Default, o1Default];

  test.for(defaults.map((check) => ({ check })))("$check.id : path_ids vide, sources non vide, pack core-git-activity", ({ check }) => {
    expect(check.path_ids).toEqual([]);
    expect(check.sources.length).toBeGreaterThan(0);
    expect(check.pack).toBe("core-git-activity");
    expect(check.enabled).toBe(true);
  });

  test.for(defaults.map((check) => ({ check })))("$check.id : run() ne produit jamais d'Evidence (le juge sème directement)", ({ check }) => {
    const ctxWithProof: ProfileContext = {
      ...EMPTY_CONTEXT,
      gitActivity: { commits: { ai_coauthored_ratio: 0.9 } },
    };
    const { referentiel } = loadReferentiel();
    expect(check.run(ctxWithProof, referentiel)).toEqual([]);
  });
});

describe("pipeline complet (runAnalysis) — profil sans AUCUNE trace d'usage IA", () => {
  // Cette fixture synthétique ne vise pas à rendre `outcome.evidence` vide :
  // elle porte de vraies données quantitatives (`size_distribution`,
  // `parallelism`, `tests`, …) qui n'attestent PAS d'un usage IA
  // (`ai_coauthored_ratio: 0`, `sessions_per_week: 0`, aucun artefact
  // `repo-context/`) mais restent observables par les checks
  // Taille/Intervention/Parallèle/Harness/Ownership, indépendamment de
  // `hasAiUsageProof` (`src/analyze.ts` exécute TOUJOURS tout le registre —
  // seul `judge()` court-circuite sur `hasAiUsageProof`, en ignorant
  // l'`Evidence` produite). L'invariant réel à vérifier est donc : de
  // l'`Evidence` PEUT exister, mais `judgeResult` reste `"indeterminate"`
  // (fourchette White–Gold, confiance 0, aucun rang) quoi qu'elle contienne —
  // jamais `evidence.length === 0`.
  test("status indeterminate, fourchette White-Gold, confiance 0, quelle que soit l'Evidence produite", () => {
    const outcome = runAnalysis(SYNTHETIC_NO_AI_TRACE_DIR, "no-ai-trace-synthetic", {
      includeExperimentalLlm: false,
    });

    expect(outcome.hasAiUsageProof).toBe(false);
    expect(outcome.judgeResult.status).toBe("indeterminate");
    expect(outcome.judgeResult.rang_affiche).toBeNull();
    expect(outcome.judgeResult.fourchette).toEqual({ bas: "white", haut: "gold" });
    expect(outcome.judgeResult.confiance_globale).toBe(0);
  });
});

describe("pipeline complet (runAnalysis) — les 4 étalons réels déclenchent tous la preuve d'usage IA", () => {
  const standardProfiles = ["perceval", "bohort", "leodagan", "arthur"] as const;

  test.for(standardProfiles.map((name) => ({ name })))(
    "$name : hasAiUsageProof=true, status ok (pas indeterminate)",
    ({ name }) => {
      const outcome = runAnalysis(resolve(FIXTURES_DIR, name), name, { includeExperimentalLlm: false });
      expect(outcome.hasAiUsageProof).toBe(true);
      expect(outcome.judgeResult.status).toBe("ok");
    },
  );
});
