/**
 * Preuve MÉCANIQUE, transversale aux 8 adaptateurs
 * (`read`, `git-activity`, `pull-requests`, `sonar`, `repo-context`, `session`,
 * `declaratif`, `profile`), qu'aucune exception ne s'échappe jamais d'un
 * adaptateur — quel que soit le contenu hostile qu'on lui donne à digérer.
 *
 * Principe du test : chaque cas hostile est écrit sur disque, puis la fonction
 * publique de l'adaptateur est appelée à l'intérieur d'un `try/catch` propre
 * au test. Le test ÉCHOUE si ce `catch` est atteint — la preuve recherchée
 * n'est PAS que « le test ne plante pas » (un `try/catch` dans le test lui-même
 * masquerait ça), mais que le `catch` du TEST ne reçoit jamais rien, parce que
 * l'adaptateur a lui-même intercepté et transformé toute erreur en
 * `{ok:false, warning}` (ou en donnée partielle) avant de rendre la main. Ce
 * test est donc délibérément indépendant, générique et mécanique — il ne
 * connaît aucun détail de code d'avertissement précis (contrairement aux
 * tests par adaptateur de `test/sources/<source>.test.ts`, qui vérifient EUX
 * le contenu exact des avertissements).
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { AsOfWindow } from "../../src/core/as-of.js";
import { loadDeclaratif } from "../../src/sources/declaratif.js";
import { loadGitActivity } from "../../src/sources/git-activity.js";
import { loadProfile } from "../../src/sources/profile.js";
import { loadPullRequests } from "../../src/sources/pull-requests.js";
import { readBoundedText, readTextTreeBounded } from "../../src/sources/read.js";
import { loadRepoContext } from "../../src/sources/repo-context.js";
import { loadSession } from "../../src/sources/session.js";
import { loadSonarMeasures } from "../../src/sources/sonar.js";

const scratchDirs: string[] = [];

function makeScratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "recognaize-contract-sweep-"));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (scratchDirs.length > 0) {
    const dir = scratchDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

const WIDE_WINDOW: AsOfWindow = { from: "2000-01-01", to: "2100-01-01" };

/** Un cas hostile écrit un contenu de fichier donné — appliqué uniformément à toute pièce, JSON ou markdown. */
interface HostileCase {
  readonly id: string;
  readonly write: (fileAbs: string) => void;
}

function writeText(fileAbs: string, content: string): void {
  mkdirSync(dirname(fileAbs), { recursive: true });
  writeFileSync(fileAbs, content, "utf8");
}

function writeBuffer(fileAbs: string, content: Buffer): void {
  mkdirSync(dirname(fileAbs), { recursive: true });
  writeFileSync(fileAbs, content);
}

const HOSTILE_CASES: readonly HostileCase[] = [
  { id: "invalid_json", write: (f) => writeText(f, "{ ceci n'est pas du JSON valide du tout") },
  { id: "array_instead_of_object", write: (f) => writeText(f, JSON.stringify([1, 2, 3, "x", null])) },
  { id: "null_top_level", write: (f) => writeText(f, "null") },
  {
    id: "utf16_no_bom",
    write: (f) =>
      writeBuffer(
        f,
        Buffer.from(
          "Texte assez long pour déclencher l'heuristique de détection UTF-16 sans BOM, plusieurs mots.",
          "utf16le",
        ),
      ),
  },
  { id: "oversized_3mb", write: (f) => writeBuffer(f, Buffer.alloc(3_000_001, "x")) },
  {
    id: "unknown_field",
    write: (f) =>
      writeText(
        f,
        JSON.stringify({
          un_champ_totalement_inconnu_du_futur: { imbrique: [1, 2, { encore: true }] },
        }),
      ),
  },
  {
    id: "wrong_type_field",
    write: (f) =>
      writeText(
        f,
        JSON.stringify({
          total: "pas un nombre",
          ratio: "0.9",
          merged: "true",
          coverage: { pas: "un scalaire" },
        }),
      ),
  },
];

interface AdapterUnderTest {
  readonly name: string;
  /** Chemin de la pièce nommée relatif au dossier de profil, ex. `git-activity.json` ou `repo-context/AGENTS.md`. */
  readonly pieceRelPath: string;
  readonly call: (profileDirAbs: string) => unknown;
}

const ADAPTERS: readonly AdapterUnderTest[] = [
  { name: "git-activity", pieceRelPath: "git-activity.json", call: (dir) => loadGitActivity(dir) },
  { name: "pull-requests", pieceRelPath: "pull-requests.json", call: (dir) => loadPullRequests(dir, WIDE_WINDOW) },
  { name: "sonar", pieceRelPath: "sonar-measures.json", call: (dir) => loadSonarMeasures(dir) },
  { name: "profile", pieceRelPath: "profile.json", call: (dir) => loadProfile(dir) },
  { name: "session", pieceRelPath: "session.md", call: (dir) => loadSession(dir) },
  { name: "declaratif", pieceRelPath: "declaratif.md", call: (dir) => loadDeclaratif(dir) },
  { name: "repo-context", pieceRelPath: "repo-context/AGENTS.md", call: (dir) => loadRepoContext(dir) },
];

/** `true` seulement si le `catch` de CE test a lui-même reçu quelque chose — jamais un `.not.toThrow()` qui masquerait un mauvais type d'assertion. */
function callWithoutSwallowing(fn: () => unknown): { readonly escaped: boolean; readonly result: unknown } {
  try {
    const result = fn();
    return { escaped: false, result };
  } catch {
    return { escaped: true, result: undefined };
  }
}

describe("contract sweep — aucune exception ne s'échappe d'un adaptateur (Part 3, phase 4, tâche 2)", () => {
  for (const adapter of ADAPTERS) {
    describe(`loadXxx pour la pièce '${adapter.name}'`, () => {
      for (const hostile of HOSTILE_CASES) {
        test(`cas hostile '${hostile.id}' : le catch du test n'est jamais atteint`, () => {
          const dir = makeScratchDir();
          const fileAbs = join(dir, adapter.pieceRelPath);
          hostile.write(fileAbs);

          const { escaped, result } = callWithoutSwallowing(() => adapter.call(dir));

          expect(escaped).toBe(false);
          expect(result).toBeDefined();
          expect(typeof (result as { ok?: unknown }).ok).toBe("boolean");
        });
      }

      test("symlink échappant à la racine du dossier analysé : le catch du test n'est jamais atteint", () => {
        const outsideDir = makeScratchDir();
        const secretAbs = join(outsideDir, "secret-piece");
        writeFileSync(secretAbs, "contenu hors dossier analysé, quelle que soit sa forme\n", "utf8");

        const dir = makeScratchDir();
        const fileAbs = join(dir, adapter.pieceRelPath);
        mkdirSync(dirname(fileAbs), { recursive: true });
        symlinkSync(secretAbs, fileAbs);

        const { escaped, result } = callWithoutSwallowing(() => adapter.call(dir));

        expect(escaped).toBe(false);
        expect(typeof (result as { ok?: unknown }).ok).toBe("boolean");
      });

      test("dossier de profil totalement vide (pièce absente) : le catch du test n'est jamais atteint", () => {
        const dir = makeScratchDir();

        const { escaped, result } = callWithoutSwallowing(() => adapter.call(dir));

        expect(escaped).toBe(false);
        expect(typeof (result as { ok?: unknown }).ok).toBe("boolean");
      });
    });
  }

  describe("read.ts — primitives partagées (les 8 adaptateurs en dépendent)", () => {
    for (const hostile of HOSTILE_CASES) {
      test(`readBoundedText : cas hostile '${hostile.id}' — le catch du test n'est jamais atteint`, () => {
        const dir = makeScratchDir();
        const fileAbs = join(dir, "piece.txt");
        hostile.write(fileAbs);

        const { escaped, result } = callWithoutSwallowing(() => readBoundedText(dir, fileAbs));

        expect(escaped).toBe(false);
        expect(typeof (result as { ok?: unknown }).ok).toBe("boolean");
      });

      test(`readTextTreeBounded : cas hostile '${hostile.id}' dans un sous-arbre — le catch du test n'est jamais atteint`, () => {
        const dir = makeScratchDir();
        const codeDir = join(dir, "code");
        mkdirSync(codeDir, { recursive: true });
        hostile.write(join(codeDir, "piece.txt"));

        const { escaped, result } = callWithoutSwallowing(() => readTextTreeBounded(dir, codeDir));

        expect(escaped).toBe(false);
        expect(Array.isArray((result as { files?: unknown }).files)).toBe(true);
        expect(Array.isArray((result as { warnings?: unknown }).warnings)).toBe(true);
      });
    }

    test("readBoundedText : symlink échappant à la racine — le catch du test n'est jamais atteint", () => {
      const outsideDir = makeScratchDir();
      const secretAbs = join(outsideDir, "secret.txt");
      writeFileSync(secretAbs, "contenu hors dossier analysé\n", "utf8");

      const dir = makeScratchDir();
      const fileAbs = join(dir, "code", "escape.txt");
      mkdirSync(join(dir, "code"), { recursive: true });
      symlinkSync(secretAbs, fileAbs);

      const { escaped, result } = callWithoutSwallowing(() => readBoundedText(dir, fileAbs));

      expect(escaped).toBe(false);
      expect((result as { ok?: unknown }).ok).toBe(false);
    });
  });
});
