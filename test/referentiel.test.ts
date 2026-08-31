import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { ReferentielInvalideError, loadReferentiel } from "../src/core/referentiel.js";
import { resolveReferentielPath } from "../src/core/paths.js";

const REAL_REFERENTIEL_PATH = resolveReferentielPath();

const scratchDirs: string[] = [];

function makeScratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "recognaize-referentiel-test-"));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (scratchDirs.length > 0) {
    const dir = scratchDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

/** Nombre de marches attendu par axe, dans l'ordre T, H, I, P, O (24 au total). */
const EXPECTED_MARCHE_COUNT_BY_AXIS: Record<string, number> = { T: 4, H: 7, I: 5, P: 3, O: 5 };
const DEFAULT_MARCHE_IDS = new Set(["T1", "H1", "I1", "P1", "O1"]);

describe("loadReferentiel — référentiel réel", () => {
  test("charge sans erreur et couvre les 24 marches des 5 axes", () => {
    const { referentiel } = loadReferentiel();

    expect(referentiel.axes).toHaveLength(5);

    let totalMarches = 0;
    for (const axis of referentiel.axes) {
      expect(axis.marches.length).toBe(EXPECTED_MARCHE_COUNT_BY_AXIS[axis.id]);
      totalMarches += axis.marches.length;
    }
    expect(totalMarches).toBe(24);
  });

  test("chaque marche non « défaut » a au moins un path_id et un seuil ; les 5 marches défaut n'en ont pas besoin", () => {
    const { referentiel } = loadReferentiel();

    const nonDefaultMarcheIds: string[] = [];
    for (const axis of referentiel.axes) {
      for (const marche of axis.marches) {
        if (DEFAULT_MARCHE_IDS.has(marche.id)) {
          expect(marche.default).toBe(true);
          continue;
        }
        expect(marche.default).toBe(false);
        expect(marche.proof_paths.length).toBeGreaterThanOrEqual(1);
        for (const proofPath of marche.proof_paths) {
          expect(referentiel.thresholds[proofPath.path_id]).toBeDefined();
        }
        nonDefaultMarcheIds.push(marche.id);
      }
    }

    // Exactement les 5 marches "défaut" citées par le plan, ni plus ni moins.
    expect(nonDefaultMarcheIds).toHaveLength(24 - DEFAULT_MARCHE_IDS.size);
  });

  test("la ligne de montée couvre les 4 axes officiels avec les 6 rangs attendus", () => {
    const { referentiel } = loadReferentiel();

    expect(referentiel.ladder).toEqual({
      red: ["T1", "H1", "I1", "P1"],
      blue: ["T2", "H2", "H3", "I2"],
      green: ["T3", "H4", "I3"],
      copper: ["P2", "P3"],
      silver: ["H5", "H6", "I4"],
      gold: ["H7", "I5"],
    });
  });

  test("ownership.blocking est false et confiance_source respecte les valeurs figées", () => {
    const { referentiel } = loadReferentiel();

    expect(referentiel.ownership.blocking).toBe(false);
    expect(referentiel.confiance_source).toEqual({
      GA: 1.0,
      RC: 1.0,
      PR: 0.9,
      SO: 0.8,
      S: 0.6,
      SU: 0.3,
      DEC: 0,
    });
  });
});

describe("loadReferentiel — seuil manquant", () => {
  test("un seuil manquant sur T2.p1 fait échouer le chargement en nommant T2.p1", () => {
    const brokenReferentiel = JSON.parse(readFileSync(REAL_REFERENTIEL_PATH, "utf8")) as {
      thresholds: Record<string, unknown>;
    };
    expect(brokenReferentiel.thresholds["T2.p1"]).toBeDefined();
    delete brokenReferentiel.thresholds["T2.p1"];

    const dir = makeScratchDir();
    const brokenPath = join(dir, "referentiel-broken.json");
    writeFileSync(brokenPath, JSON.stringify(brokenReferentiel), "utf8");

    expect(() => loadReferentiel(brokenPath)).toThrow(ReferentielInvalideError);
    try {
      loadReferentiel(brokenPath);
      throw new Error("loadReferentiel aurait dû lever ReferentielInvalideError");
    } catch (error) {
      expect(error).toBeInstanceOf(ReferentielInvalideError);
      expect((error as Error).message).toContain("T2.p1");
    }
  });

  test("un path_id sans marche « propriétaire » cohérente fait échouer le chargement", () => {
    const brokenReferentiel = JSON.parse(readFileSync(REAL_REFERENTIEL_PATH, "utf8")) as {
      axes: { id: string; marches: { id: string; proof_paths: { path_id: string }[] }[] }[];
    };
    const axisT = brokenReferentiel.axes.find((axis) => axis.id === "T");
    const marcheT2 = axisT?.marches.find((marche) => marche.id === "T2");
    expect(marcheT2).toBeDefined();
    if (marcheT2) {
      marcheT2.proof_paths[0].path_id = "Z9.p1";
    }

    const dir = makeScratchDir();
    const brokenPath = join(dir, "referentiel-orphan-path.json");
    writeFileSync(brokenPath, JSON.stringify(brokenReferentiel), "utf8");

    expect(() => loadReferentiel(brokenPath)).toThrow(/Z9\.p1/);
  });

  test("un fichier JSON invalide fait échouer le chargement sans planter le process", () => {
    const dir = makeScratchDir();
    const invalidPath = join(dir, "referentiel-invalid.json");
    writeFileSync(invalidPath, "{ ceci n'est pas du JSON", "utf8");

    expect(() => loadReferentiel(invalidPath)).toThrow(ReferentielInvalideError);
  });

  test("un fichier absent fait échouer le chargement en nommant le chemin", () => {
    const dir = makeScratchDir();
    const missingPath = join(dir, "n-existe-pas.json");

    expect(() => loadReferentiel(missingPath)).toThrow(ReferentielInvalideError);
    expect(() => loadReferentiel(missingPath)).toThrow(/n-existe-pas\.json/);
  });
});

describe("referentiel_hash", () => {
  test("est stable entre deux chargements successifs du même fichier", () => {
    const first = loadReferentiel();
    const second = loadReferentiel();

    expect(second.referentiel_hash).toBe(first.referentiel_hash);
    expect(first.referentiel_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("ne dépend pas de l'ordre des clés du JSON source", () => {
    const parsed = JSON.parse(readFileSync(REAL_REFERENTIEL_PATH, "utf8")) as Record<string, unknown>;
    const reorderedKeys = Object.keys(parsed).reverse();
    const reordered: Record<string, unknown> = {};
    for (const key of reorderedKeys) {
      reordered[key] = parsed[key];
    }

    const dir = makeScratchDir();
    const reorderedPath = join(dir, "referentiel-reordered.json");
    writeFileSync(reorderedPath, JSON.stringify(reordered), "utf8");

    const original = loadReferentiel();
    const fromReordered = loadReferentiel(reorderedPath);

    expect(fromReordered.referentiel_hash).toBe(original.referentiel_hash);
  });

  test("change si le contenu logique change", () => {
    const parsed = JSON.parse(readFileSync(REAL_REFERENTIEL_PATH, "utf8")) as {
      confiance_source: Record<string, number>;
    };
    parsed.confiance_source.DEC = 0.01;

    const dir = makeScratchDir();
    const mutatedPath = join(dir, "referentiel-mutated.json");
    writeFileSync(mutatedPath, JSON.stringify(parsed), "utf8");

    const original = loadReferentiel();
    const mutated = loadReferentiel(mutatedPath);

    expect(mutated.referentiel_hash).not.toBe(original.referentiel_hash);
  });
});

describe("thresholdFor", () => {
  test("retourne le seuil déclaré pour un path_id connu", async () => {
    const { referentiel } = loadReferentiel();
    const { thresholdFor } = await import("../src/core/referentiel.js");

    const threshold = thresholdFor(referentiel, "T2.p1");
    expect(threshold).toEqual(referentiel.thresholds["T2.p1"]);
  });

  test("lève pour un path_id inconnu", async () => {
    const { referentiel } = loadReferentiel();
    const { thresholdFor } = await import("../src/core/referentiel.js");

    expect(() => thresholdFor(referentiel, "Z9.p1")).toThrow(/Z9\.p1/);
  });
});

describe("résolution du chemin — indépendante du répertoire courant", () => {
  test("resolveReferentielPath() retourne un chemin absolu, stable quel que soit process.cwd()", () => {
    const pathFromCurrentCwd = resolveReferentielPath();

    const originalCwd = process.cwd();
    const otherDir = makeScratchDir();
    try {
      process.chdir(otherDir);
      const pathFromOtherCwd = resolveReferentielPath();
      expect(pathFromOtherCwd).toBe(pathFromCurrentCwd);
    } finally {
      process.chdir(originalCwd);
    }

    expect(pathFromCurrentCwd.endsWith("referentiel.json")).toBe(true);
    expect(readFileSync(pathFromCurrentCwd, "utf8").length).toBeGreaterThan(0);
  });

  test("loadReferentiel() sans argument lit bien le fichier résolu par resolveReferentielPath()", () => {
    const { referentiel_hash: hashFromDefault } = loadReferentiel();
    const { referentiel_hash: hashFromExplicitPath } = loadReferentiel(resolveReferentielPath());

    expect(hashFromDefault).toBe(hashFromExplicitPath);
  });
});
