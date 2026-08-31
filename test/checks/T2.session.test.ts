import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-session/T2.session.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { SessionDigest } from "../../src/sources/session.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function digest(excerpt: string): SessionDigest {
  return { turnCount: 1, convention: "bold_header", toolCalls: [], excerpt, truncated: false };
}

describe("T2.session — S.files_touched_single_module ≥ 3, force toujours indice", () => {
  test("3 chemins distincts du même module → prouvée, force indice", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      session: digest("Assistant: je touche `api/billing/invoice.ts`, `api/billing/dunning.ts` et `api/billing/reminder.ts`."),
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
    expect(evidence[0]?.force).toBe("indice");
  });

  test("1 seul chemin plausible (sous le seuil de 3) → infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, session: digest("Contexte : `api/billing/`, conventions dans AGENTS.md.") };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("session absente → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
