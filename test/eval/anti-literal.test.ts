// Teste `evals/anti-literal.ts` : vert sur les vrais fichiers de
// `src/checks/**`, et détecte réellement un littéral fautif sur un fichier
// jetable créé dans un répertoire temporaire (jamais sous `src/checks/`, qui
// casserait la garde pour de vrai).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { findAntiLiteralViolations } from "../../evals/anti-literal.js";

const TEST_FILE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "..", "..");
const REAL_CHECKS_DIR = resolve(REPO_ROOT, "src", "checks");
const REAL_LIB_DIR = resolve(REPO_ROOT, "src", "lib");
const REAL_SRC_DIR = resolve(REPO_ROOT, "src");

let scratchDir: string | undefined;

afterEach(() => {
  if (scratchDir !== undefined) {
    rmSync(scratchDir, { recursive: true, force: true });
    scratchDir = undefined;
  }
});

describe("findAntiLiteralViolations", () => {
  test("aucune violation sous src/checks/ réel (5 marches par défaut, toutes NO-OP)", () => {
    const violations = findAntiLiteralViolations(REAL_CHECKS_DIR, resolve(REPO_ROOT, "src"));
    expect(violations).toEqual([]);
  });

  test("détecte un littéral fautif (0.8) et nomme le fichier + la ligne", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "recognaize-anti-literal-"));
    const packDir = join(scratchDir, "fake-pack");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, "X1.fake.ts"),
      [
        "const check = {",
        '  id: "X1.fake",',
        "  path_ids: [],",
        "  run: () => {",
        "    const seuil = 0.8; // littéral interdit",
        "    return seuil;",
        "  },",
        "};",
        "export default check;",
        "",
      ].join("\n"),
      "utf8",
    );

    const violations = findAntiLiteralViolations(scratchDir);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe("fake-pack/X1.fake.ts");
    expect(violations[0]?.line).toBe(5);
    expect(violations[0]?.literalText).toBe("0.8");
  });

  test("tolère 0 et 1 (et -1, sentinelle usuelle) partout dans le fichier", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "recognaize-anti-literal-ok-"));
    const packDir = join(scratchDir, "fake-pack");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, "X2.fake.ts"),
      [
        "const notFoundIndex = -1;",
        "const zero = 0;",
        "const one = 1;",
        "const arr = [0, 1];",
        "export default { id: 'X2.fake', notFoundIndex, zero, one, arr };",
        "",
      ].join("\n"),
      "utf8",
    );

    const violations = findAntiLiteralViolations(scratchDir);
    expect(violations).toEqual([]);
  });

  test("ne lève jamais sur un répertoire sans aucun fichier .ts", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "recognaize-anti-literal-empty-"));
    expect(() => findAntiLiteralViolations(scratchDir as string)).not.toThrow();
    expect(findAntiLiteralViolations(scratchDir)).toEqual([]);
  });

  // La garde couvre aussi src/lib/, pas seulement src/checks/ : un seuil réel
  // qui vivrait dans src/lib/ (ex. count >= 2 pour H7, dans
  // lib/repo-context-signals.ts — déplacé dans referentiel.json) resterait
  // sinon invisible à `evals/anti-literal.ts`. Une exemption étroite par
  // commentaire `anti-littéral-lib:` reste réservée aux constantes
  // structurelles/d'affichage qui ne sont pas des seuils consommés par un
  // check.
  describe("extension à src/lib/ (revue indépendante, 2026-08-29)", () => {
    test("aucune violation sous src/lib/ réel (littéraux réels tous exemptés avec justification, ou déplacés dans referentiel.json)", () => {
      const violations = findAntiLiteralViolations(REAL_LIB_DIR, REAL_SRC_DIR);
      expect(violations).toEqual([]);
    });

    test("le marqueur d'exemption fonctionne sous un fichier étiqueté lib/", () => {
      scratchDir = mkdtempSync(join(tmpdir(), "recognaize-anti-literal-lib-ok-"));
      const libDir = join(scratchDir, "lib");
      mkdirSync(libDir, { recursive: true });
      writeFileSync(
        join(libDir, "structural.ts"),
        ["export function isoDayLength(): number {", "  return 10; // anti-littéral-lib: longueur d'un préfixe ISO, constante structurelle.", "}", ""].join("\n"),
        "utf8",
      );

      const violations = findAntiLiteralViolations(scratchDir);
      expect(violations).toEqual([]);
    });

    test("le marqueur SANS justification (rien après les deux-points) ne suffit pas", () => {
      scratchDir = mkdtempSync(join(tmpdir(), "recognaize-anti-literal-lib-empty-justif-"));
      const libDir = join(scratchDir, "lib");
      mkdirSync(libDir, { recursive: true });
      writeFileSync(
        join(libDir, "unjustified.ts"),
        ["export function suspicious(): number {", "  return 7; // anti-littéral-lib:", "}", ""].join("\n"),
        "utf8",
      );

      const violations = findAntiLiteralViolations(scratchDir);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.literalText).toBe("7");
    });

    test("le marqueur est IGNORÉ hors de lib/ (ex. un fichier étiqueté fake-pack/, comme un check) — jamais de contournement en dehors de lib/", () => {
      scratchDir = mkdtempSync(join(tmpdir(), "recognaize-anti-literal-not-lib-"));
      const packDir = join(scratchDir, "fake-pack");
      mkdirSync(packDir, { recursive: true });
      writeFileSync(
        join(packDir, "X3.fake.ts"),
        ["export default { seuil: 42 }; // anti-littéral-lib: tentative de contournement hors lib/.", ""].join("\n"),
        "utf8",
      );

      const violations = findAntiLiteralViolations(scratchDir);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.literalText).toBe("42");
    });
  });
});
