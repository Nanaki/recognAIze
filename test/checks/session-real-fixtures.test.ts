/**
 * Vérifie que `session.md` de bohort produit des indices H1, I2, I3, O1, O2,
 * O3 et aucune marche "prouvée" par la session seule. `H1`/`O1` sont des
 * marches par défaut (`proof_paths: []`, `H1.session.ts`/`O1.session.ts`
 * NO-OP) — aucune `Evidence` réelle n'est donc jamais attendue de leur part,
 * quel que soit le contenu textuel. Ce test vérifie donc les 4 marches qui
 * PEUVENT réellement porter une `Evidence` de session parmi les 6 citées
 * (`I2`, `I3`, `O2`, `O3`), et l'absence de toute Evidence `"prouve"` (force)
 * nulle part dans le run entier — jamais possible pour une source `S`,
 * `referentiel.json` fige `force: "indice"` sur chacun de ses chemins de
 * preuve.
 */
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import h1Session from "../../src/checks/core-session/H1.session.js";
import h6Session from "../../src/checks/core-session/H6.session.js";
import h7Session from "../../src/checks/core-session/H7.session.js";
import i2Session from "../../src/checks/core-session/I2.session.js";
import i3Session from "../../src/checks/core-session/I3.session.js";
import o1Session from "../../src/checks/core-session/O1.session.js";
import o2Session from "../../src/checks/core-session/O2.session.js";
import o3Session from "../../src/checks/core-session/O3.session.js";
import o4Session from "../../src/checks/core-session/O4.session.js";
import p2Session from "../../src/checks/core-session/P2.session.js";
import t2Session from "../../src/checks/core-session/T2.session.js";
import t3Session from "../../src/checks/core-session/T3.session.js";
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { Check, Evidence, ProfileContext } from "../../src/core/types.js";
import { loadSession } from "../../src/sources/session.js";

const { referentiel } = loadReferentiel();
const REPO_ROOT = process.cwd();
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "profiles");

const ALL_SESSION_CHECKS: readonly Check[] = [
  h1Session,
  h6Session,
  h7Session,
  i2Session,
  i3Session,
  o1Session,
  o2Session,
  o3Session,
  o4Session,
  p2Session,
  t2Session,
  t3Session,
];

function loadProfileSessionContext(profile: string): ProfileContext {
  const result = loadSession(join(FIXTURES_DIR, profile));
  if (!result.ok) {
    throw new Error(`session.md introuvable pour ${profile}`);
  }
  return { profileId: profile, session: result.data, warnings: [] };
}

function runAll(ctx: ProfileContext): readonly Evidence[] {
  return ALL_SESSION_CHECKS.flatMap((check) => check.run(ctx, referentiel));
}

describe("session-real-fixtures — bohort/session.md (le seul indice, jamais une preuve)", () => {
  const ctx = loadProfileSessionContext("bohort");
  const evidence = runAll(ctx);

  test("H1/O1 (marches par défaut) ne portent jamais d'Evidence, quel que soit le contenu", () => {
    expect(h1Session.run(ctx, referentiel)).toEqual([]);
    expect(o1Session.run(ctx, referentiel)).toEqual([]);
  });

  test("I2 (objectif + fichiers + contrainte) → indice, preuve", () => {
    const i2 = evidence.filter((e) => e.check_id === "I2.session");
    expect(i2).toHaveLength(1);
    expect(i2[0]?.polarite).toBe("preuve");
    expect(i2[0]?.force).toBe("indice");
  });

  test("I3 (question de clarification + réponse) → indice, preuve", () => {
    const i3 = evidence.filter((e) => e.check_id === "I3.session");
    expect(i3).toHaveLength(1);
    expect(i3[0]?.polarite).toBe("preuve");
    expect(i3[0]?.force).toBe("indice");
  });

  test("O2 (« commence par les tests », « [9 tests écrits, tous en échec] ») → indice, preuve", () => {
    const o2 = evidence.filter((e) => e.check_id === "O2.session");
    expect(o2).toHaveLength(1);
    expect(o2[0]?.polarite).toBe("preuve");
    expect(o2[0]?.force).toBe("indice");
  });

  test("O3 (« la cause », TODO documenté) → indice, preuve", () => {
    const o3 = evidence.filter((e) => e.check_id === "O3.session");
    expect(o3).toHaveLength(1);
    expect(o3[0]?.polarite).toBe("preuve");
    expect(o3[0]?.force).toBe("indice");
  });

  test("aucune Evidence de force 'prouve' nulle part dans ce run — la session seule ne prouve jamais rien", () => {
    expect(evidence.every((e) => e.force === "indice")).toBe(true);
  });
});

describe("session-real-fixtures — arthur/session.md (indices distincts : parallélisme, plan en phases)", () => {
  const ctx = loadProfileSessionContext("arthur");
  const evidence = runAll(ctx);

  test("P2 (« Fil 3. », « fil 1 », « fils » — travail parallèle explicite) → indice, preuve", () => {
    const p2 = evidence.filter((e) => e.check_id === "P2.session");
    expect(p2).toHaveLength(1);
    expect(p2[0]?.polarite).toBe("preuve");
  });

  test("T3 (« phases », ≥2 couches évoquées : script + job) → indice, preuve", () => {
    const t3 = evidence.filter((e) => e.check_id === "T3.session");
    expect(t3).toHaveLength(1);
    expect(t3[0]?.polarite).toBe("preuve");
  });

  test("aucune Evidence de force 'prouve' nulle part dans ce run", () => {
    expect(evidence.every((e) => e.force === "indice")).toBe(true);
  });
});

describe("session-real-fixtures — leodagan et perceval n'ont pas de session.md", () => {
  test("les deux profils sont sans session dans les fixtures réelles", () => {
    expect(loadSession(join(FIXTURES_DIR, "leodagan")).ok).toBe(false);
    expect(loadSession(join(FIXTURES_DIR, "perceval")).ok).toBe(false);
  });
});
