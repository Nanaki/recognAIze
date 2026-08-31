import { describe, expect, test } from "vitest";

import check from "../../src/checks/core-session/H1.session.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ProfileContext } from "../../src/core/types.js";

const { referentiel } = loadReferentiel();
const EMPTY: ProfileContext = { profileId: "test", warnings: [] };

describe("H1.session — NO-OP délibéré (marche par défaut, aucun path_id ne peut lui être rattaché)", () => {
  test("path_ids déclaré vide", () => {
    expect(check.path_ids).toEqual([]);
  });

  test("run() ne produit jamais d'Evidence", () => {
    expect(check.run(EMPTY, referentiel)).toEqual([]);
  });
});
