// Contract tests pour `src/sources/git-activity.ts`.
// Fichiers réels écrits dans un tmpdir (`aidd_docs/memory/testing.md` : « les
// sources sont testées sur des fichiers réels »), plus les 4 fixtures réelles du
// dépôt. Couvre : les 4 profils réels sans avertissement inattendu, un champ
// présent-mais-mal-typé rendant CE champ inconnu sans casser le reste, ratio
// hors bornes, total négatif, JSON invalide, top-level non-objet — jamais
// d'exception.

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { loadGitActivity } from "../../src/sources/git-activity.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "profiles");
const REAL_PROFILES = ["bohort", "arthur", "leodagan", "perceval"] as const;

const scratchDirs: string[] = [];

function makeScratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "recognaize-git-activity-"));
  scratchDirs.push(dir);
  return dir;
}

function writeGitActivity(dir: string, content: string): void {
  writeFileSync(join(dir, "git-activity.json"), content, "utf8");
}

afterEach(() => {
  while (scratchDirs.length > 0) {
    const dir = scratchDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("loadGitActivity — les 4 fixtures réelles", () => {
  for (const profile of REAL_PROFILES) {
    test(`${profile}/git-activity.json ne produit aucun avertissement inattendu`, () => {
      const result = loadGitActivity(join(FIXTURES_DIR, profile));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.warnings).toEqual([]);
        expect(result.data.period).toBeDefined();
        expect(result.data.pull_requests?.total).toBeGreaterThan(0);
        expect(result.data.commits?.ai_coauthored_ratio).toBeGreaterThanOrEqual(0);
      }
    });
  }

  test("bohort : les champs numériques attendus sont bien exploités (pas seulement présents)", () => {
    const result = loadGitActivity(join(FIXTURES_DIR, "bohort"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.period).toEqual({ from: "2026-01-15", to: "2026-07-15" });
      expect(result.data.pull_requests).toMatchObject({
        total: 48,
        size_distribution: { xs: 4, s: 12, m: 24, l: 7, xl: 1 },
        median_files_changed: 7,
        median_lines_changed: 251.5,
        median_correction_commits_after_open: 2,
        merged_without_human_edit_after_open: 10,
        reverted: 1,
        median_review_comments_received: 3,
      });
      expect(result.data.commits).toMatchObject({
        total: 357,
        median_per_pr: 7,
        ai_coauthored_ratio: 0.58,
        message_convention_compliance: 0.88,
      });
      expect(result.data.context_files).toMatchObject({
        agents_md: true,
        last_updated: "2026-07-12",
      });
      expect(result.data.assistant_usage).toMatchObject({
        declared_tools: ["claude-code", "chatgpt-web"],
        editor_integration: true,
        sessions_per_week: 31,
        tokens_per_week: 1900000,
      });
    }
  });

  test("perceval : context_files.last_updated null est une valeur valide, pas une absence de champ", () => {
    const result = loadGitActivity(join(FIXTURES_DIR, "perceval"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.context_files?.last_updated).toBeNull();
      expect(result.data.context_files?.agents_md).toBe(false);
      expect(result.warnings).toEqual([]);
    }
  });
});

describe("loadGitActivity — tolérance champ par champ", () => {
  test("ai_coauthored_ratio en chaîne ⇒ ce champ précis inconnu, avec avertissement le nommant, le reste exploité", () => {
    const dir = makeScratchDir();
    writeGitActivity(
      dir,
      JSON.stringify({
        period: { from: "2026-01-15", to: "2026-07-15" },
        commits: { total: 100, ai_coauthored_ratio: "0.91", message_convention_compliance: 0.8 },
      }),
    );

    const result = loadGitActivity(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.commits?.ai_coauthored_ratio).toBeUndefined();
      expect(result.data.commits?.total).toBe(100);
      expect(result.data.commits?.message_convention_compliance).toBe(0.8);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.cause).toContain("commits.ai_coauthored_ratio");
    }
  });

  test("size_distribution: null ⇒ toute la section inconnue avec UN avertissement, le reste de pull_requests exploité", () => {
    const dir = makeScratchDir();
    writeGitActivity(
      dir,
      JSON.stringify({
        pull_requests: { total: 48, size_distribution: null, median_files_changed: 7 },
      }),
    );

    const result = loadGitActivity(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pull_requests?.size_distribution).toBeUndefined();
      expect(result.data.pull_requests?.total).toBe(48);
      expect(result.data.pull_requests?.median_files_changed).toBe(7);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.cause).toContain("pull_requests.size_distribution");
    }
  });

  test("total: -1 (négatif) ⇒ inconnu pour ce champ, avertissement", () => {
    const dir = makeScratchDir();
    writeGitActivity(dir, JSON.stringify({ pull_requests: { total: -1, reverted: 2 } }));

    const result = loadGitActivity(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pull_requests?.total).toBeUndefined();
      expect(result.data.pull_requests?.reverted).toBe(2);
      expect(result.warnings.some((w) => w.cause.includes("pull_requests.total"))).toBe(true);
    }
  });

  test("ratio hors [0;1] (failure_rate: 1.4) ⇒ inconnu pour ce champ", () => {
    const dir = makeScratchDir();
    writeGitActivity(dir, JSON.stringify({ ci: { failure_rate: 1.4, median_runs_to_green: 2 } }));

    const result = loadGitActivity(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ci?.failure_rate).toBeUndefined();
      expect(result.data.ci?.median_runs_to_green).toBe(2);
    }
  });

  test("ratio négatif (ai_coauthored_ratio: -0.1) ⇒ inconnu pour ce champ", () => {
    const dir = makeScratchDir();
    writeGitActivity(dir, JSON.stringify({ commits: { ai_coauthored_ratio: -0.1 } }));

    const result = loadGitActivity(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.commits?.ai_coauthored_ratio).toBeUndefined();
    }
  });

  test("champ inconnu au niveau top-level est simplement ignoré, sans avertissement (passthrough tolérant)", () => {
    const dir = makeScratchDir();
    writeGitActivity(dir, JSON.stringify({ repositories: 3, un_champ_du_futur: { x: 1 } }));

    const result = loadGitActivity(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.repositories).toBe(3);
      expect(result.warnings).toEqual([]);
    }
  });

  test("champ simplement absent ne produit jamais d'avertissement", () => {
    const dir = makeScratchDir();
    writeGitActivity(dir, JSON.stringify({ repositories: 3 }));

    const result = loadGitActivity(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.commits).toBeUndefined();
      expect(result.warnings).toEqual([]);
    }
  });
});

describe("loadGitActivity — pièce entière illisible", () => {
  test("JSON invalide ⇒ {ok:false, warning}, jamais d'exception", () => {
    const dir = makeScratchDir();
    writeGitActivity(dir, "{ ceci n'est pas du JSON");

    expect(() => loadGitActivity(dir)).not.toThrow();
    const result = loadGitActivity(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("invalid_json");
    }
  });

  test("top-level un tableau (pas un objet) ⇒ {ok:false, warning}", () => {
    const dir = makeScratchDir();
    writeGitActivity(dir, JSON.stringify([1, 2, 3]));

    const result = loadGitActivity(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("not_object");
    }
  });

  test("fichier absent ⇒ {ok:false, warning}, jamais d'exception", () => {
    const dir = makeScratchDir();

    expect(() => loadGitActivity(dir)).not.toThrow();
    const result = loadGitActivity(dir);
    expect(result.ok).toBe(false);
  });

  test("dossier hostile (symlink sortant, fichier trop gros) n'est jamais un souci pour cet adaptateur : il ne lit qu'un seul fichier nommé", () => {
    const dir = makeScratchDir();
    mkdirSync(join(dir, "code"));
    writeGitActivity(dir, JSON.stringify({ repositories: 1 }));

    expect(() => loadGitActivity(dir)).not.toThrow();
    const result = loadGitActivity(dir);
    expect(result.ok).toBe(true);
  });
});

// Complète le jeu des 8 cas hostiles du contract test sur les
// cas non encore couverts ci-dessus (invalid JSON, array vs object, champ
// inconnu/mal typé : déjà testés plus haut). `null` top-level, BOM/UTF-16,
// fichier de 3 Mo et symlink sortant manquaient explicitement pour cet
// adaptateur précis.
describe("loadGitActivity — Phase 4 : cas de contrat additionnels", () => {
  test("contenu top-level `null` (JSON valide, pas un objet) ⇒ {ok:false, warning}, jamais d'exception", () => {
    const dir = makeScratchDir();
    writeGitActivity(dir, "null");

    expect(() => loadGitActivity(dir)).not.toThrow();
    const result = loadGitActivity(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("not_object");
    }
  });

  test("git-activity.json précédé d'un BOM UTF-8 est lu et parsé normalement", () => {
    const dir = makeScratchDir();
    const body = JSON.stringify({ repositories: 2 });
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf8")]);
    writeFileSync(join(dir, "git-activity.json"), withBom);

    const result = loadGitActivity(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.repositories).toBe(2);
      expect(result.warnings).toEqual([]);
    }
  });

  test("git-activity.json en UTF-16 sans BOM ⇒ {ok:false, warning encoding_unreadable} propagé depuis read.ts, jamais d'exception", () => {
    const dir = makeScratchDir();
    const text = JSON.stringify({ repositories: 1, note: "texte assez long pour l'heuristique UTF-16" });
    writeFileSync(join(dir, "git-activity.json"), Buffer.from(text, "utf16le"));

    expect(() => loadGitActivity(dir)).not.toThrow();
    const result = loadGitActivity(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("encoding_unreadable");
    }
  });

  test("git-activity.json de plus de 2 Mo ⇒ {ok:false, warning file_too_large}, jamais lu en entier", () => {
    const dir = makeScratchDir();
    writeFileSync(join(dir, "git-activity.json"), Buffer.alloc(3_000_001, "x"));

    expect(() => loadGitActivity(dir)).not.toThrow();
    const result = loadGitActivity(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("file_too_large");
    }
  });

  test("git-activity.json comme lien symbolique sortant du dossier analysé ⇒ {ok:false, warning symlink_escapes_root}", () => {
    const outsideDir = makeScratchDir();
    const secret = join(outsideDir, "secret-git-activity.json");
    writeFileSync(secret, JSON.stringify({ repositories: 999 }), "utf8");

    const dir = makeScratchDir();
    symlinkSync(secret, join(dir, "git-activity.json"));

    expect(() => loadGitActivity(dir)).not.toThrow();
    const result = loadGitActivity(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("symlink_escapes_root");
    }
  });
});
