import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-session/I2.session.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";
import type { SessionDigest } from "../../src/sources/session.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

function digest(excerpt: string): SessionDigest {
  return { turnCount: 1, convention: "bold_header", toolCalls: [], excerpt, truncated: false };
}

describe("I2.session — S.first_prompt_framed, force toujours indice", () => {
  test("objectif + fichier + contrainte → prouvée, force indice (jamais 'prouve')", () => {
    const ctx: ProfileContext = {
      ...EMPTY,
      session: digest("Personne: On ajoute la relance. Contexte : `api/billing/`. Ne touche pas au module de paiement."),
    };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("preuve");
    expect(evidence[0]?.force).toBe("indice");
  });

  test("aucun motif → infirmée (une seule session peut infirmer)", () => {
    const ctx: ProfileContext = { ...EMPTY, session: digest("Assistant: Corrigé.") };
    const evidence = check.run(ctx, referentiel);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.polarite).toBe("contre-preuve");
  });

  test("session absente → aucune Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
