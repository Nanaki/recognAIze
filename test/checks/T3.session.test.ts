import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-session/T3.session.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { SessionDigest } from "../../src/sources/session.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function digest(excerpt: string): SessionDigest {
  return { turnCount: 1, convention: "bold_header", toolCalls: [], excerpt, truncated: false };
}

describe("T3.session — S.has_phased_plan ET S.layers_touched ≥ 2, force toujours indice", () => {
  test("plan en phases + 2 couches distinctes (script, job) → prouvée, force indice", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      session: digest(
        "Assistant: Quatre phases, chacune livrable seule. Le script de reprise annuelle et le job de relance nocturne restent en v1.",
      ),
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
    expect(evidence[0]?.force).toBe("indice");
  });

  test("plan évoqué mais 1 seule couche → infirmée", () => {
    const ctx: ProfileContext = { ...EMPTY, session: digest("Assistant: Quatre phases pour ce script.") };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("session absente → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
