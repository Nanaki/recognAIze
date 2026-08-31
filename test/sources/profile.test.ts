// Contract tests pour `src/sources/profile.ts`.
// Couvre : les 4 fixtures réelles (aucune incohérence attendue — `available`
// y correspond exactement à ce qui est sur disque, vérifié manuellement),
// `profile_id`/`stack`/`available` mal typés, JSON invalide, et le cas
// d'acceptation central : `available` annonçant `session.md` absent alors
// qu'il est présent sur disque ⇒ incohérence listée, fichier lu quand même.

import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { loadProfile } from "../../src/sources/profile.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "profiles");
const FIXTURES_HOSTILE_DIR = join(REPO_ROOT, "fixtures", "hostile");
const REAL_PROFILES = ["bohort", "arthur", "leodagan", "perceval"] as const;

const scratchDirs: string[] = [];

function makeScratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "recognaize-profile-"));
  scratchDirs.push(dir);
  return dir;
}

function writeProfile(dir: string, content: string): void {
  writeFileSync(join(dir, "profile.json"), content, "utf8");
}

afterEach(() => {
  while (scratchDirs.length > 0) {
    const dir = scratchDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("loadProfile — les 4 fixtures réelles", () => {
  for (const profile of REAL_PROFILES) {
    test(`${profile}/profile.json ne produit aucune incohérence inattendue`, () => {
      const result = loadProfile(join(FIXTURES_DIR, profile));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.profileId).toBe(profile);
      expect(result.data.stack.length).toBeGreaterThan(0);
      expect(result.data.incoherences).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  }
});

describe("loadProfile — profile.json absent ou illisible", () => {
  test("dossier sans profile.json : {ok:false}", () => {
    const dir = makeScratchDir();
    const result = loadProfile(dir);
    expect(result.ok).toBe(false);
  });

  test("JSON invalide : {ok:false, warning nommant le fichier}", () => {
    const dir = makeScratchDir();
    writeProfile(dir, "{ not json");
    const result = loadProfile(dir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.warning.code).toBe("invalid_json");
  });

  test("contenu top-level non-objet (tableau) : {ok:false}", () => {
    const dir = makeScratchDir();
    writeProfile(dir, "[1,2,3]");
    const result = loadProfile(dir);
    expect(result.ok).toBe(false);
  });
});

describe("loadProfile — champs mal typés", () => {
  test("profile_id numérique ⇒ champ inconnu + avertissement, le reste exploité", () => {
    const dir = makeScratchDir();
    writeProfile(dir, JSON.stringify({ profile_id: 42, stack: ["TypeScript"] }));

    const result = loadProfile(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.profileId).toBeUndefined();
    expect(result.data.stack).toEqual(["TypeScript"]);
    expect(result.warnings.some((w) => w.code === "invalid_field")).toBe(true);
  });

  test("stack objet (pas un tableau) ⇒ champ inconnu, vide par défaut", () => {
    const dir = makeScratchDir();
    writeProfile(dir, JSON.stringify({ profile_id: "x", stack: { lang: "TypeScript" } }));

    const result = loadProfile(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stack).toEqual([]);
    expect(result.warnings.some((w) => w.code === "invalid_field")).toBe(true);
  });

  test("available absent du JSON ⇒ aucune incohérence tentée (rien de déclaré à comparer)", () => {
    const dir = makeScratchDir();
    writeProfile(dir, JSON.stringify({ profile_id: "x", stack: ["TypeScript"] }));

    const result = loadProfile(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.available).toBeUndefined();
    expect(result.data.incoherences).toEqual([]);
  });
});

describe("loadProfile — incohérence available vs disque (critère d'acceptation central)", () => {
  test("available annonce session.md ABSENT alors qu'il est PRÉSENT sur disque : incohérence listée, fichier lu quand même", () => {
    const dir = makeScratchDir();
    cpSync(join(FIXTURES_DIR, "bohort"), dir, { recursive: true });
    // bohort déclare `available` avec session.md ; on le retire de la déclaration
    // SANS toucher au fichier réel, qui reste présent sur disque.
    writeProfile(
      dir,
      JSON.stringify({
        profile_id: "bohort",
        stack: ["TypeScript", "Next.js", "Prisma"],
        available: ["git-activity.json", "pull-requests.json", "code/", "sonar-measures.json", "repo-context/", "declaratif.md"],
      }),
    );

    const result = loadProfile(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const incoherence = result.data.incoherences.find((i) => i.piece === "session.md");
    expect(incoherence).toBeDefined();
    expect(incoherence?.declaredAvailable).toBe(false);
    expect(incoherence?.actuallyPresent).toBe(true);
    expect(result.warnings.some((w) => w.code === "available_incoherent" && w.cause.includes("session.md"))).toBe(true);
  });

  test("available annonce pull-requests.json PRÉSENT alors qu'il est ABSENT sur disque : incohérence listée", () => {
    const dir = makeScratchDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "git-activity.json"), "{}", "utf8");
    writeProfile(
      dir,
      JSON.stringify({
        profile_id: "x",
        stack: ["TypeScript"],
        available: ["git-activity.json", "pull-requests.json"],
      }),
    );

    const result = loadProfile(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const incoherence = result.data.incoherences.find((i) => i.piece === "pull-requests.json");
    expect(incoherence).toBeDefined();
    expect(incoherence?.declaredAvailable).toBe(true);
    expect(incoherence?.actuallyPresent).toBe(false);
  });

  test("code/ et repo-context/ (slash final) sont normalisés avant comparaison", () => {
    const dir = makeScratchDir();
    mkdirSync(join(dir, "code"), { recursive: true });
    mkdirSync(join(dir, "repo-context"), { recursive: true });
    writeProfile(
      dir,
      JSON.stringify({
        profile_id: "x",
        stack: [],
        available: ["code/", "repo-context/"],
      }),
    );

    const result = loadProfile(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.incoherences).toEqual([]);
  });
});

// Complète le jeu des 8 cas hostiles. Invalid JSON, array vs
// objet et champ mal typé sont déjà couverts plus haut. `null` top-level,
// BOM/UTF-16, fichier de 3 Mo, symlink sortant et un champ top-level inconnu
// manquaient pour cet adaptateur.
describe("loadProfile — Phase 4 : cas de contrat additionnels", () => {
  test("contenu top-level `null` (JSON valide, pas un objet) ⇒ {ok:false, warning}, jamais d'exception", () => {
    const dir = makeScratchDir();
    writeProfile(dir, "null");

    expect(() => loadProfile(dir)).not.toThrow();
    const result = loadProfile(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("not_object");
    }
  });

  test("profile.json précédé d'un BOM UTF-8 est lu et parsé normalement", () => {
    const dir = makeScratchDir();
    const body = JSON.stringify({ profile_id: "bom-test", stack: ["TypeScript"] });
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf8")]);
    writeFileSync(join(dir, "profile.json"), withBom);

    const result = loadProfile(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.profileId).toBe("bom-test");
      expect(result.warnings).toEqual([]);
    }
  });

  test("profile.json en UTF-16 sans BOM ⇒ {ok:false, warning encoding_unreadable} propagé, jamais d'exception", () => {
    const dir = makeScratchDir();
    const text = JSON.stringify({ profile_id: "texte assez long pour l'heuristique de détection UTF-16" });
    writeFileSync(join(dir, "profile.json"), Buffer.from(text, "utf16le"));

    expect(() => loadProfile(dir)).not.toThrow();
    const result = loadProfile(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("encoding_unreadable");
    }
  });

  test("profile.json de plus de 2 Mo ⇒ {ok:false, warning file_too_large}, jamais lu en entier", () => {
    const dir = makeScratchDir();
    writeFileSync(join(dir, "profile.json"), Buffer.alloc(3_000_001, "x"));

    expect(() => loadProfile(dir)).not.toThrow();
    const result = loadProfile(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("file_too_large");
    }
  });

  test("profile.json comme lien symbolique sortant du dossier analysé ⇒ {ok:false, warning symlink_escapes_root}", () => {
    const outsideDir = makeScratchDir();
    const secret = join(outsideDir, "secret-profile.json");
    writeFileSync(secret, JSON.stringify({ profile_id: "evil" }), "utf8");

    const dir = makeScratchDir();
    symlinkSync(secret, join(dir, "profile.json"));

    expect(() => loadProfile(dir)).not.toThrow();
    const result = loadProfile(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("symlink_escapes_root");
    }
  });

  test("champ top-level totalement inconnu est simplement ignoré (passthrough tolérant)", () => {
    const dir = makeScratchDir();
    writeProfile(
      dir,
      JSON.stringify({
        profile_id: "x",
        stack: ["TypeScript"],
        un_champ_du_futur_pas_encore_documente: { x: [1, 2, 3] },
      }),
    );

    const result = loadProfile(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.profileId).toBe("x");
      expect(result.warnings).toEqual([]);
    }
  });

  test("fixture réelle fixtures/hostile/ : profile_id avec emoji et incohérence available/disque, sans exception", () => {
    const result = loadProfile(FIXTURES_HOSTILE_DIR);

    expect(() => loadProfile(FIXTURES_HOSTILE_DIR)).not.toThrow();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.profileId).toBe("hostile-fixture-🤖");
    expect(result.data.incoherences.some((i) => i.piece === "pull-requests.json")).toBe(true);
    expect(result.warnings.some((w) => w.code === "available_incoherent")).toBe(true);
  });
});
