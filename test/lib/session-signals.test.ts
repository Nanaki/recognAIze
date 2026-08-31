import { describe, expect, test } from "vitest";

import {
  aiReviewBeforePr,
  autonomousRetryUntilGreen,
  contextCorrectionOrRcaPresent,
  filesTouchedSingleModuleCount,
  firstPromptFramed,
  hasPhasedPlan,
  layersTouchedCount,
  milestoneFramingPresent,
  parallelWorktreesMentioned,
  subagentsOrchestrated,
  testsFirstSeenFailing,
} from "../../src/lib/session-signals.js";
import type { SessionDigest } from "../../src/sources/session.js";

function digest(excerpt: string): SessionDigest {
  return { turnCount: 2, convention: "bold_header", toolCalls: [], excerpt, truncated: false };
}

describe("session-signals — absence de session ⇒ undefined partout", () => {
  test("toutes les fonctions rendent undefined si session est absente", () => {
    expect(firstPromptFramed(undefined)).toBeUndefined();
    expect(milestoneFramingPresent(undefined)).toBeUndefined();
    expect(testsFirstSeenFailing(undefined)).toBeUndefined();
    expect(contextCorrectionOrRcaPresent(undefined)).toBeUndefined();
    expect(autonomousRetryUntilGreen(undefined)).toBeUndefined();
    expect(subagentsOrchestrated(undefined)).toBeUndefined();
    expect(parallelWorktreesMentioned(undefined)).toBeUndefined();
    expect(aiReviewBeforePr(undefined)).toBeUndefined();
    expect(filesTouchedSingleModuleCount(undefined)).toBeUndefined();
    expect(hasPhasedPlan(undefined)).toBeUndefined();
    expect(layersTouchedCount(undefined)).toBeUndefined();
  });

  test("session présente mais excerpt vide ⇒ false/0, jamais undefined", () => {
    const empty = digest("");
    expect(firstPromptFramed(empty)).toBe(false);
    expect(testsFirstSeenFailing(empty)).toBe(false);
    expect(filesTouchedSingleModuleCount(empty)).toBe(0);
    expect(layersTouchedCount(empty)).toBe(0);
  });
});

describe("firstPromptFramed — I2 (objectif + fichier + contrainte)", () => {
  test("les 3 éléments présents ⇒ true", () => {
    expect(
      firstPromptFramed(digest("Personne: On ajoute la relance. Contexte : `api/billing/`. Ne touche pas au module de paiement.")),
    ).toBe(true);
  });
  test("objectif et fichier seuls, sans contrainte ⇒ false", () => {
    expect(firstPromptFramed(digest("Personne: On ajoute la relance. Contexte : `api/billing/`."))).toBe(false);
  });
});

describe("milestoneFramingPresent — I3 (question de clarification OU plan/phases/étape)", () => {
  test("question de clarification avec réponse ⇒ true", () => {
    expect(
      milestoneFramingPresent(digest("Assistant: Question avant d'écrire : est-ce hors séquence ?\nPersonne: Hors séquence.")),
    ).toBe(true);
  });
  test("plan en phases évoqué ⇒ true", () => {
    expect(milestoneFramingPresent(digest("Assistant: Quatre phases, chacune livrable et réversible seule."))).toBe(true);
  });
  test("ni question ni plan ⇒ false", () => {
    expect(milestoneFramingPresent(digest("Assistant: Corrigé. J'implémente."))).toBe(false);
  });
  test("« ? » présent mais aucune forme de question (ni mot « question » ni plan/phase) ⇒ false — régression bug de rang réel : l'ancienne regex se réduisait à « contient un ? »", () => {
    expect(milestoneFramingPresent(digest("Assistant: Le build passe au vert ?"))).toBe(false);
  });
});

describe("testsFirstSeenFailing — O2", () => {
  test("« commence par les tests » ⇒ true", () => {
    expect(testsFirstSeenFailing(digest("Personne: Commence par les tests, dans le style existant."))).toBe(true);
  });
  test("[9 tests écrits, tous en échec] ⇒ true", () => {
    expect(testsFirstSeenFailing(digest("[9 tests écrits, tous en échec]"))).toBe(true);
  });
  test("tests au vert, jamais mentionnés en échec au départ ⇒ false", () => {
    expect(testsFirstSeenFailing(digest("Assistant: pytest tests/payments -q au vert, 61 tests."))).toBe(false);
  });
});

describe("contextCorrectionOrRcaPresent — O3", () => {
  test("« La cause : » ⇒ true", () => {
    expect(contextCorrectionOrRcaPresent(digest("Assistant: Le test échoue. La cause : DunningService lit ..."))).toBe(true);
  });
  test("TODO documenté ⇒ true", () => {
    expect(contextCorrectionOrRcaPresent(digest("Personne: laisse un TODO sur l'export."))).toBe(true);
  });
  test("aucun motif ⇒ false", () => {
    expect(contextCorrectionOrRcaPresent(digest("Assistant: Corrigé. J'implémente."))).toBe(false);
  });
});

describe("autonomousRetryUntilGreen — H6 indice", () => {
  test("« jusqu'au vert » avec relance ⇒ true", () => {
    expect(autonomousRetryUntilGreen(digest("Assistant: Je relance les tests jusqu'au vert, seul."))).toBe(true);
  });
  test("aucun motif ⇒ false", () => {
    expect(autonomousRetryUntilGreen(digest("Assistant: Corrigé."))).toBe(false);
  });
});

describe("subagentsOrchestrated — H7 indice", () => {
  test("« sous-agents » ⇒ true", () => {
    expect(subagentsOrchestrated(digest("Assistant: J'orchestre 3 sous-agents en parallèle."))).toBe(true);
  });
  test("aucun motif ⇒ false", () => {
    expect(subagentsOrchestrated(digest("Assistant: Corrigé."))).toBe(false);
  });
});

describe("parallelWorktreesMentioned — P2 indice", () => {
  test("« Fil 3. » ⇒ true", () => {
    expect(parallelWorktreesMentioned(digest("Personne: Fil 3. Migration du connecteur Stripe."))).toBe(true);
  });
  test("« worktree » ⇒ true", () => {
    expect(parallelWorktreesMentioned(digest("Assistant: J'utilise un worktree séparé."))).toBe(true);
  });
  test("aucun motif ⇒ false", () => {
    expect(parallelWorktreesMentioned(digest("Assistant: Corrigé."))).toBe(false);
  });
});

describe("aiReviewBeforePr — O4 indice", () => {
  test("« revue IA avant PR » ⇒ true", () => {
    expect(aiReviewBeforePr(digest("Assistant: J'ai fait une revue IA avant d'ouvrir la PR."))).toBe(true);
  });
  test("aucun motif ⇒ false", () => {
    expect(aiReviewBeforePr(digest("Assistant: PR ouverte en brouillon."))).toBe(false);
  });
});

describe("filesTouchedSingleModuleCount — T2 indice", () => {
  test("3 chemins distincts partageant le même premier segment ⇒ 3", () => {
    expect(
      filesTouchedSingleModuleCount(
        digest("Assistant: je touche `api/billing/invoice.ts`, `api/billing/dunning.ts` et `api/billing/reminder.ts`."),
      ),
    ).toBe(3);
  });
  test("1 seul chemin plausible (bohort) ⇒ 1, sous le seuil de 3", () => {
    expect(filesTouchedSingleModuleCount(digest("Contexte : `api/billing/`, conventions dans AGENTS.md."))).toBe(1);
  });
  test("aucun chemin plausible ⇒ 0", () => {
    expect(filesTouchedSingleModuleCount(digest("Assistant: Corrigé. J'implémente."))).toBe(0);
  });
});

describe("hasPhasedPlan / layersTouchedCount — T3 indice", () => {
  test("« phases » présent ⇒ hasPhasedPlan true", () => {
    expect(hasPhasedPlan(digest("Assistant: Quatre phases, chacune livrable et réversible seule."))).toBe(true);
  });
  test("2 couches distinctes évoquées (script + job) ⇒ layersTouchedCount = 2", () => {
    expect(
      layersTouchedCount(digest("Assistant: le script de reprise annuelle et le job de relance nocturne ne sont pas couverts.")),
    ).toBe(2);
  });
  test("aucune couche évoquée ⇒ 0", () => {
    expect(layersTouchedCount(digest("Assistant: Corrigé."))).toBe(0);
  });
});
