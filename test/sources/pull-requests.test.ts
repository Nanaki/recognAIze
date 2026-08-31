// Contract tests pour `src/sources/pull-requests.ts`.
// Couvre les fixtures réelles (`bohort`, `leodagan`), les formes `{items}` et
// tableau bare, la déduplication par `number`, le filtrage par fenêtre
// (`as-of.ts`), le tableau vide comme « présent mais muet » distinct d'un
// fichier absent, l'absence de `NaN` quand aucune PR fusionnée ne tombe dans la
// fenêtre, et l'illisibilité totale — jamais d'exception.

import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import type { AsOfWindow } from "../../src/core/as-of.js";
import { loadPullRequests } from "../../src/sources/pull-requests.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "profiles");

const scratchDirs: string[] = [];

function makeScratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "recognaize-pull-requests-"));
  scratchDirs.push(dir);
  return dir;
}

function writePullRequests(dir: string, content: string): void {
  writeFileSync(join(dir, "pull-requests.json"), content, "utf8");
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

describe("loadPullRequests — fixtures réelles", () => {
  test("bohort/pull-requests.json (tableau bare, fenêtre couvrant tout) : médianes cohérentes, sans avertissement", () => {
    const result = loadPullRequests(join(FIXTURES_DIR, "bohort"), WIDE_WINDOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual([]);
      // 12 entrées dans la fixture, 1 non mergée (#1292) => 11 mergées dans la fenêtre large.
      expect(result.data.totalEntries).toBe(12);
      expect(result.data.mergedInWindowCount).toBe(11);
      expect(result.data.medianChangedFiles.status).toBe("ok");
      expect(result.data.medianReviewComments.status).toBe("ok");
      expect(result.data.medianCreatedToMergedDays.status).toBe("ok");
    }
  });

  test("leodagan/pull-requests.json : même contrat, sans avertissement", () => {
    const result = loadPullRequests(join(FIXTURES_DIR, "leodagan"), WIDE_WINDOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual([]);
      expect(result.data.totalEntries).toBe(12);
      // 1 PR ouverte (#1138, merged:false) => 11 mergées.
      expect(result.data.mergedInWindowCount).toBe(11);
    }
  });

  test("fenêtre étroite ne couvrant aucune merged_at ⇒ mergedInWindowCount = 0, présent mais muet, aucun NaN", () => {
    const narrowWindow: AsOfWindow = { from: "1999-01-01", to: "1999-01-02" };

    const result = loadPullRequests(join(FIXTURES_DIR, "bohort"), narrowWindow);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.mergedInWindowCount).toBe(0);
      expect(result.data.medianChangedFiles).toEqual({ status: "unknown", reason: "dénominateur nul" });
      expect(result.data.medianLinesChanged).toEqual({ status: "unknown", reason: "dénominateur nul" });
      expect(result.data.medianReviewComments).toEqual({ status: "unknown", reason: "dénominateur nul" });
      expect(result.data.medianCreatedToMergedDays).toEqual({ status: "unknown", reason: "dénominateur nul" });
      expect(JSON.stringify(result.data)).not.toContain("NaN");
    }
  });
});

describe("loadPullRequests — forme top-level", () => {
  test("{items: [...]} est accepté au même titre qu'un tableau bare", () => {
    const dir = makeScratchDir();
    writePullRequests(
      dir,
      JSON.stringify({
        items: [
          {
            number: 1,
            merged: true,
            merged_at: "2026-05-01T00:00:00Z",
            created_at: "2026-04-25T00:00:00Z",
            changed_files: 3,
            additions: 10,
            deletions: 5,
            review_comments: 2,
          },
        ],
      }),
    );

    const result = loadPullRequests(dir, WIDE_WINDOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalEntries).toBe(1);
      expect(result.data.mergedInWindowCount).toBe(1);
      expect(result.data.medianChangedFiles).toEqual({ status: "ok", value: 3 });
      expect(result.data.medianLinesChanged).toEqual({ status: "ok", value: 15 });
      expect(result.data.medianReviewComments).toEqual({ status: "ok", value: 2 });
      expect(result.data.medianCreatedToMergedDays).toEqual({ status: "ok", value: 6 });
    }
  });

  test("tableau vide ⇒ présent mais muet : ok:true, totalEntries 0, médianes unknown — distinct d'un fichier absent", () => {
    const dir = makeScratchDir();
    writePullRequests(dir, JSON.stringify([]));

    const result = loadPullRequests(dir, WIDE_WINDOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalEntries).toBe(0);
      expect(result.data.mergedInWindowCount).toBe(0);
      expect(result.data.medianChangedFiles).toEqual({ status: "unknown", reason: "dénominateur nul" });
    }
  });

  test("{items: []} (vide) est aussi présent mais muet", () => {
    const dir = makeScratchDir();
    writePullRequests(dir, JSON.stringify({ items: [] }));

    const result = loadPullRequests(dir, WIDE_WINDOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalEntries).toBe(0);
    }
  });

  test("forme non reconnue ({} sans items, ou scalaire) ⇒ {ok:false, warning}", () => {
    const dir = makeScratchDir();
    writePullRequests(dir, JSON.stringify({ total: 5 }));

    const result = loadPullRequests(dir, WIDE_WINDOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("unrecognized_shape");
    }
  });

  test("fichier absent ⇒ {ok:false}, distinct du tableau vide (présent mais muet)", () => {
    const dir = makeScratchDir();

    expect(() => loadPullRequests(dir, WIDE_WINDOW)).not.toThrow();
    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(false);
  });
});

describe("loadPullRequests — déduplication par number", () => {
  test("des entrées dupliquées par 'number' ne comptent qu'une fois, avertissement sur les suivantes", () => {
    const dir = makeScratchDir();
    writePullRequests(
      dir,
      JSON.stringify([
        {
          number: 42,
          merged: true,
          merged_at: "2026-05-01T00:00:00Z",
          created_at: "2026-04-25T00:00:00Z",
          changed_files: 1,
          additions: 1,
          deletions: 1,
          review_comments: 1,
        },
        {
          number: 42,
          merged: true,
          merged_at: "2026-05-02T00:00:00Z",
          created_at: "2026-04-26T00:00:00Z",
          changed_files: 999,
          additions: 999,
          deletions: 999,
          review_comments: 999,
        },
      ]),
    );

    const result = loadPullRequests(dir, WIDE_WINDOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalEntries).toBe(1);
      expect(result.data.mergedInWindowCount).toBe(1);
      expect(result.data.medianChangedFiles).toEqual({ status: "ok", value: 1 });
      expect(result.warnings.some((w) => w.code === "duplicate_pr_number")).toBe(true);
    }
  });
});

describe("loadPullRequests — merged/merged_at/fenêtre", () => {
  test("merged: false n'est jamais retenu, même avec un merged_at dans la fenêtre", () => {
    const dir = makeScratchDir();
    writePullRequests(
      dir,
      JSON.stringify([
        { number: 1, merged: false, merged_at: null, created_at: "2026-04-01T00:00:00Z" },
      ]),
    );

    const result = loadPullRequests(dir, WIDE_WINDOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalEntries).toBe(1);
      expect(result.data.mergedInWindowCount).toBe(0);
    }
  });

  test("merged: true avec merged_at hors fenêtre n'est pas retenu", () => {
    const dir = makeScratchDir();
    const window: AsOfWindow = { from: "2026-06-01", to: "2026-07-01" };
    writePullRequests(
      dir,
      JSON.stringify([
        {
          number: 1,
          merged: true,
          merged_at: "2026-01-01T00:00:00Z",
          created_at: "2025-12-01T00:00:00Z",
          changed_files: 1,
        },
      ]),
    );

    const result = loadPullRequests(dir, window);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.mergedInWindowCount).toBe(0);
    }
  });

  test("merged: true avec merged_at aux bornes exactes de la fenêtre (incluses) est retenu", () => {
    const dir = makeScratchDir();
    const window: AsOfWindow = { from: "2026-06-01", to: "2026-07-01" };
    writePullRequests(
      dir,
      JSON.stringify([
        {
          number: 1,
          merged: true,
          merged_at: "2026-07-01T23:59:00Z",
          created_at: "2026-06-01T00:00:00Z",
          changed_files: 4,
        },
      ]),
    );

    const result = loadPullRequests(dir, window);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.mergedInWindowCount).toBe(1);
    }
  });

  test("merged: true mais merged_at manquant ⇒ exclue du calcul de fenêtre, avertissement, pas d'exception", () => {
    const dir = makeScratchDir();
    writePullRequests(dir, JSON.stringify([{ number: 1, merged: true }]));

    const result = loadPullRequests(dir, WIDE_WINDOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.mergedInWindowCount).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  test("'merged' en chaîne au lieu de booléen ⇒ champ invalide, exclue, avertissement", () => {
    const dir = makeScratchDir();
    writePullRequests(dir, JSON.stringify([{ number: 1, merged: "true", merged_at: "2026-05-01T00:00:00Z" }]));

    const result = loadPullRequests(dir, WIDE_WINDOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.mergedInWindowCount).toBe(0);
      expect(result.warnings.some((w) => w.cause.includes("merged"))).toBe(true);
    }
  });
});

describe("loadPullRequests — entrées invalides", () => {
  test("entrée sans 'number' valide est ignorée, avertissement, le reste exploité", () => {
    const dir = makeScratchDir();
    writePullRequests(
      dir,
      JSON.stringify([
        { title: "sans number" },
        { number: 2, merged: true, merged_at: "2026-05-01T00:00:00Z", created_at: "2026-04-01T00:00:00Z" },
      ]),
    );

    const result = loadPullRequests(dir, WIDE_WINDOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalEntries).toBe(1);
      expect(result.warnings.some((w) => w.code === "invalid_entry")).toBe(true);
    }
  });

  test("entrée qui n'est pas un objet (chaîne, null) est ignorée sans exception", () => {
    const dir = makeScratchDir();
    writePullRequests(dir, JSON.stringify(["pas un objet", null, 42]));

    expect(() => loadPullRequests(dir, WIDE_WINDOW)).not.toThrow();
    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalEntries).toBe(0);
    }
  });

  test("JSON invalide ⇒ {ok:false, warning}, jamais d'exception", () => {
    const dir = makeScratchDir();
    writePullRequests(dir, "{ pas du JSON");

    expect(() => loadPullRequests(dir, WIDE_WINDOW)).not.toThrow();
    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("invalid_json");
    }
  });
});

// Complète le jeu des 8 cas hostiles. Invalid JSON, array vs
// objet ({items} vs tableau bare), champ inconnu/mal typé sont déjà couverts
// plus haut. `null` top-level, BOM/UTF-16, fichier de 3 Mo, symlink sortant et
// un champ d'entrée totalement inconnu (passthrough) manquaient.
describe("loadPullRequests — Phase 4 : cas de contrat additionnels", () => {
  test("contenu top-level `null` (JSON valide, ni tableau ni {items}) ⇒ {ok:false, warning unrecognized_shape}", () => {
    const dir = makeScratchDir();
    writePullRequests(dir, "null");

    expect(() => loadPullRequests(dir, WIDE_WINDOW)).not.toThrow();
    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("unrecognized_shape");
    }
  });

  test("pull-requests.json précédé d'un BOM UTF-8 est lu et parsé normalement", () => {
    const dir = makeScratchDir();
    const body = JSON.stringify([{ number: 1, merged: true, merged_at: "2026-05-01T00:00:00Z" }]);
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf8")]);
    writeFileSync(join(dir, "pull-requests.json"), withBom);

    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.mergedInWindowCount).toBe(1);
    }
  });

  test("pull-requests.json en UTF-16 sans BOM ⇒ {ok:false, warning encoding_unreadable} propagé, jamais d'exception", () => {
    const dir = makeScratchDir();
    const text = JSON.stringify([{ number: 1, note: "texte assez long pour l'heuristique de détection UTF-16" }]);
    writeFileSync(join(dir, "pull-requests.json"), Buffer.from(text, "utf16le"));

    expect(() => loadPullRequests(dir, WIDE_WINDOW)).not.toThrow();
    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("encoding_unreadable");
    }
  });

  test("pull-requests.json de plus de 2 Mo ⇒ {ok:false, warning file_too_large}, jamais lu en entier", () => {
    const dir = makeScratchDir();
    writeFileSync(join(dir, "pull-requests.json"), Buffer.alloc(3_000_001, "x"));

    expect(() => loadPullRequests(dir, WIDE_WINDOW)).not.toThrow();
    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("file_too_large");
    }
  });

  test("pull-requests.json comme lien symbolique sortant du dossier analysé ⇒ {ok:false, warning symlink_escapes_root}", () => {
    const outsideDir = makeScratchDir();
    const secret = join(outsideDir, "secret-prs.json");
    writeFileSync(secret, JSON.stringify([{ number: 999, merged: true }]), "utf8");

    const dir = makeScratchDir();
    symlinkSync(secret, join(dir, "pull-requests.json"));

    expect(() => loadPullRequests(dir, WIDE_WINDOW)).not.toThrow();
    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("symlink_escapes_root");
    }
  });

  test("un champ totalement inconnu sur une entrée est simplement ignoré (passthrough tolérant)", () => {
    const dir = makeScratchDir();
    writePullRequests(
      dir,
      JSON.stringify([
        {
          number: 1,
          merged: true,
          merged_at: "2026-05-01T00:00:00Z",
          created_at: "2026-04-25T00:00:00Z",
          changed_files: 3,
          un_champ_du_futur_pas_encore_documente: { x: [1, 2, 3] },
        },
      ]),
    );

    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalEntries).toBe(1);
      expect(result.data.mergedInWindowCount).toBe(1);
      expect(result.warnings).toEqual([]);
    }
  });
});

// `body` et `structuredBodyRatio` : `O3.pull-requests.ts` a besoin de ce
// champ, présent dans les fixtures réelles.
describe("loadPullRequests — Part 4 phase 2 : body / structuredBodyRatio", () => {
  test("body structuré (en-tête + liste + mot-clé + assez de lignes) → ratio 1", () => {
    const dir = makeScratchDir();
    const structuredBody = "## Contexte\n- point un\n- point deux\n\n## Changement\ndétails";
    writePullRequests(
      dir,
      JSON.stringify([{ number: 1, merged: true, merged_at: "2026-05-01T00:00:00Z", body: structuredBody }]),
    );

    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.structuredBodyRatio).toEqual({ status: "ok", value: 1 });
    }
  });

  test("body court et non structuré (« fix bug ») → ratio 0", () => {
    const dir = makeScratchDir();
    writePullRequests(dir, JSON.stringify([{ number: 1, merged: true, merged_at: "2026-05-01T00:00:00Z", body: "fix bug" }]));

    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.structuredBodyRatio).toEqual({ status: "ok", value: 0 });
    }
  });

  test("body: null (présent mais nul) exclu du dénominateur ; aucun body non nul ⇒ dénominateur nul", () => {
    const dir = makeScratchDir();
    writePullRequests(dir, JSON.stringify([{ number: 1, merged: true, merged_at: "2026-05-01T00:00:00Z", body: null }]));

    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.structuredBodyRatio).toEqual({ status: "unknown", reason: "dénominateur nul" });
    }
  });

  test("body absent (champ non présent sur l'entrée) ⇒ également exclu, dénominateur nul", () => {
    const dir = makeScratchDir();
    writePullRequests(dir, JSON.stringify([{ number: 1, merged: true, merged_at: "2026-05-01T00:00:00Z" }]));

    const result = loadPullRequests(dir, WIDE_WINDOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.structuredBodyRatio).toEqual({ status: "unknown", reason: "dénominateur nul" });
      expect(result.warnings).toEqual([]);
    }
  });
});
