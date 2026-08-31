// Contract tests pour `src/sources/session.ts`.
// Couvre : les 2 fixtures réelles (`**Personne**`/`**Assistant**`), 4 variantes
// synthétiques de conventions d'en-tête, un `session.md` vide (digest vide +
// avertissement), une session de 10 000 lignes (troncature), et un
// `session.md` absent (`{ok:false}`).

import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { SESSION_DIGEST_CHAR_BUDGET, loadSession } from "../../src/sources/session.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "profiles");
const FIXTURES_HOSTILE_DIR = join(REPO_ROOT, "fixtures", "hostile");

const scratchDirs: string[] = [];

function makeScratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "recognaize-session-"));
  scratchDirs.push(dir);
  return dir;
}

function writeSession(dir: string, content: string): void {
  writeFileSync(join(dir, "session.md"), content, "utf8");
}

afterEach(() => {
  while (scratchDirs.length > 0) {
    const dir = scratchDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("loadSession — les 2 fixtures réelles", () => {
  for (const profile of ["bohort", "arthur"] as const) {
    test(`${profile}/session.md produit des tours reconnus (convention bold_header)`, () => {
      const result = loadSession(join(FIXTURES_DIR, profile));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.convention).toBe("bold_header");
      expect(result.data.turnCount).toBeGreaterThan(0);
      expect(result.warnings).toEqual([]);
    });
  }

  test("bohort : la séquence d'outils (lignes entre crochets) est détectée", () => {
    const result = loadSession(join(FIXTURES_DIR, "bohort"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.toolCalls.length).toBeGreaterThan(0);
    expect(result.data.toolCalls.some((line) => line.includes("tests écrits"))).toBe(true);
  });
});

describe("loadSession — session.md absent", () => {
  test("un dossier sans session.md rend {ok:false}", () => {
    const dir = makeScratchDir();
    const result = loadSession(dir);
    expect(result.ok).toBe(false);
  });
});

describe("loadSession — 4 variantes synthétiques de convention d'en-tête", () => {
  test("**Human** / **AI**", () => {
    const dir = makeScratchDir();
    writeSession(
      dir,
      [
        "**Human**",
        "",
        "Add a retry to the payment client.",
        "",
        "**AI**",
        "",
        "Done. Added exponential backoff, 3 attempts.",
        "",
      ].join("\n"),
    );

    const result = loadSession(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.convention).toBe("bold_header");
    expect(result.data.turnCount).toBe(2);
  });

  test("### Tour N", () => {
    const dir = makeScratchDir();
    writeSession(
      dir,
      [
        "### Tour 1 — Personne",
        "",
        "Migre le connecteur vers l'API v2.",
        "",
        "### Tour 2 — Assistant",
        "",
        "[phase 1 exécutée]",
        "",
        "Phase 1 posée, tests verts.",
        "",
      ].join("\n"),
    );

    const result = loadSession(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.convention).toBe("tour_header");
    expect(result.data.turnCount).toBe(2);
    expect(result.data.toolCalls).toContain("[phase 1 exécutée]");
  });

  test("**Xxx** générique alterné (Dev / Copilot)", () => {
    const dir = makeScratchDir();
    writeSession(
      dir,
      [
        "**Dev**",
        "",
        "Peux-tu ajouter un endpoint de healthcheck ?",
        "",
        "**Copilot**",
        "",
        "Ajouté sous `/healthz`, retourne 200 si la base répond.",
        "",
      ].join("\n"),
    );

    const result = loadSession(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.convention).toBe("bold_header");
    expect(result.data.turnCount).toBe(2);
  });

  test("**Xxx** générique alterné avec locuteurs accentués (Développeur / IA)", () => {
    const dir = makeScratchDir();
    writeSession(
      dir,
      [
        "**Développeur**",
        "",
        "Explique la différence entre les deux branches.",
        "",
        "**IA**",
        "",
        "La branche A corrige un bug, la branche B ajoute une fonctionnalité.",
        "",
      ].join("\n"),
    );

    const result = loadSession(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.convention).toBe("bold_header");
    expect(result.data.turnCount).toBe(2);
  });
});

describe("loadSession — structure non reconnue", () => {
  test("un session.md vide produit un digest vide + un avertissement", () => {
    const dir = makeScratchDir();
    writeSession(dir, "");

    const result = loadSession(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.turnCount).toBe(0);
    expect(result.data.convention).toBe("unrecognized");
    expect(result.data.excerpt).toBe("");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe("no_recognized_turns");
  });

  test("un texte de prose libre sans aucun en-tête reconnu produit aussi un digest vide + avertissement", () => {
    const dir = makeScratchDir();
    writeSession(dir, "Juste un paragraphe de notes, sans structure de tour du tout.\n");

    const result = loadSession(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.turnCount).toBe(0);
    expect(result.warnings[0]?.code).toBe("no_recognized_turns");
  });
});

describe("loadSession — troncature à 600 tokens (~2400 caractères)", () => {
  test("une session de 10 000 lignes est tronquée, la séquence d'outils est priorisée", () => {
    const dir = makeScratchDir();
    const lines: string[] = [];
    for (let i = 0; i < 5000; i += 1) {
      lines.push("**Personne**", "", `Message assez long numéro ${i} pour remplir le budget de troncature avec du texte répétitif.`, "");
      lines.push(
        "**Assistant**",
        "",
        i % 500 === 0 ? `[appel outil numéro ${i}]` : `Réponse assez longue numéro ${i}, également répétitive pour dépasser le budget.`,
        "",
      );
    }
    writeSession(dir, lines.join("\n"));

    const result = loadSession(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.turnCount).toBe(10000);
    expect(result.data.truncated).toBe(true);
    expect(result.data.excerpt.length).toBeLessThanOrEqual(SESSION_DIGEST_CHAR_BUDGET + 1);
    // La séquence d'outils, bien que rare dans le fichier, doit apparaître dans
    // l'extrait puisqu'elle est toujours placée en tête du budget.
    expect(result.data.excerpt).toContain("[appel outil numéro 0]");
  });
});

/**
 * Complète le jeu des 8 cas hostiles pour `session.ts`.
 *
 * `session.md` est du MARKDOWN, pas du JSON : « invalid JSON » et « array vs
 * objet » n'ont pas de sens ici (aucun `JSON.parse` n'a jamais lieu dans
 * `session.ts`) — délibérément SKIPPÉS, pas silencieusement oubliés. Le cas
 * « `null` » est réinterprété comme « contenu littéral `null` » (texte de
 * prose sans structure reconnue) plutôt que JSON `null`, pour rester
 * significatif pour un adaptateur texte. « champ inconnu »/« champ mal typé »
 * n'ont pas de sens non plus (pas de schéma de champs, juste des tours de
 * texte libre) — SKIPPÉS pour la même raison, déjà couvert en substance par
 * « structure non reconnue ⇒ digest vide + avertissement » (bloc ci-dessus).
 * BOM/UTF-16, fichier de 3 Mo et symlink sortant restent pleinement
 * applicables et manquaient : ajoutés ci-dessous.
 */
describe("loadSession — Phase 4 : cas de contrat additionnels", () => {
  test("contenu littéral 'null' (texte, pas JSON) ⇒ structure non reconnue, digest vide + avertissement, jamais d'exception", () => {
    const dir = makeScratchDir();
    writeSession(dir, "null");

    expect(() => loadSession(dir)).not.toThrow();
    const result = loadSession(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.turnCount).toBe(0);
    expect(result.warnings[0]?.code).toBe("no_recognized_turns");
  });

  test("session.md précédé d'un BOM UTF-8 est décodé puis les tours sont reconnus normalement", () => {
    const dir = makeScratchDir();
    const body = "**Personne**\n\nBonjour.\n\n**Assistant**\n\nBonjour à toi.\n";
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf8")]);
    writeFileSync(join(dir, "session.md"), withBom);

    const result = loadSession(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.convention).toBe("bold_header");
      expect(result.data.turnCount).toBe(2);
      expect(result.warnings).toEqual([]);
    }
  });

  test("session.md en UTF-16 sans BOM ⇒ {ok:false, warning encoding_unreadable} propagé, jamais d'exception", () => {
    const dir = makeScratchDir();
    const text = "**Personne**\n\nTexte assez long pour déclencher l'heuristique de détection UTF-16 sans BOM.\n";
    writeFileSync(join(dir, "session.md"), Buffer.from(text, "utf16le"));

    expect(() => loadSession(dir)).not.toThrow();
    const result = loadSession(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("encoding_unreadable");
    }
  });

  test("session.md de plus de 2 Mo ⇒ {ok:false, warning file_too_large}, jamais lu en entier", () => {
    const dir = makeScratchDir();
    writeFileSync(join(dir, "session.md"), Buffer.alloc(3_000_001, "x"));

    expect(() => loadSession(dir)).not.toThrow();
    const result = loadSession(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("file_too_large");
    }
  });

  test("session.md comme lien symbolique sortant du dossier analysé ⇒ {ok:false, warning symlink_escapes_root}", () => {
    const outsideDir = makeScratchDir();
    const secret = join(outsideDir, "secret-session.md");
    writeFileSync(secret, "**Personne**\n\nContenu hors dossier analysé.\n", "utf8");

    const dir = makeScratchDir();
    symlinkSync(secret, join(dir, "session.md"));

    expect(() => loadSession(dir)).not.toThrow();
    const result = loadSession(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("symlink_escapes_root");
    }
  });

  test("fixture réelle fixtures/hostile/session.md (structure non reconnue) : digest vide + avertissement, sans exception", () => {
    expect(() => loadSession(FIXTURES_HOSTILE_DIR)).not.toThrow();
    const result = loadSession(FIXTURES_HOSTILE_DIR);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.turnCount).toBe(0);
    expect(result.warnings[0]?.code).toBe("no_recognized_turns");
  });
});
