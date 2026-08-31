import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-session/O2.session.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { SessionDigest } from "../../src/sources/session.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function digest(excerpt: string): SessionDigest {
  return { turnCount: 1, convention: "bold_header", toolCalls: [], excerpt, truncated: false };
}

describe("O2.session — S.tests_first_seen_failing, force toujours indice", () => {
  test("« commence par les tests » → prouvée, force indice", () => {
    const ctx: ProfileContext = { ...EMPTY, session: digest("Personne: Commence par les tests, dans le style existant.") };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
    expect(evidence[0]?.force).toBe("indice");
  });

  test("aucun motif → infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, session: digest("Assistant: Corrigé.") };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("session absente → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
