// Contract tests pour `src/sources/read.ts` (lecture bornée et
// normalisation d'encodage). Fichiers réels écrits dans un tmpdir, jamais de mock
// (`aidd_docs/memory/testing.md` : « les sources sont testées sur des fichiers
// réels »). Couvre :
// 1. symlink sortant refusé, fichier > 2 Mo ignoré, `code/` plafonné à 200
//    fichiers texte, chaque cas dans `warnings[]` ;
// 2. BOM UTF-8 + CRLF lu normalement, sans avertissement ;
// 3. UTF-16 avec BOM décodé, sans BOM traité comme illisible + avertissement ;
// 4. aucune exception ne traverse la frontière — y compris pour un cas que le
//    code n'anticipe pas explicitement (chemin contenant un octet nul).

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import {
  MAX_FILE_BYTES,
  readBoundedText,
  readdirSorted,
  readTextTreeBounded,
} from "../../src/sources/read.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const scratchDirs: string[] = [];

function makeScratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
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

describe("readBoundedText — symlink sortant", () => {
  test("un lien symbolique résolvant hors du dossier analysé n'est pas suivi", () => {
    const outsideDir = makeScratchDir("recognaize-read-outside-");
    const secretFile = join(outsideDir, "secret.txt");
    writeFileSync(secretFile, "contenu hors dossier analysé\n", "utf8");

    const root = makeScratchDir("recognaize-read-root-");
    mkdirSync(join(root, "code"));
    const linkPath = join(root, "code", "escape.txt");
    symlinkSync(secretFile, linkPath);

    const result = readBoundedText(root, linkPath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("symlink_escapes_root");
      expect(result.warning.file).toBe(join("code", "escape.txt"));
      // Le chemin absolu de la cible du symlink (hors du dossier analysé) ne
      // doit JAMAIS apparaître dans warnings[].cause — seul le chemin relatif
      // déjà présent dans warning.file identifie l'emplacement du problème.
      expect(result.warning.cause).not.toContain(outsideDir);
      expect(result.warning.cause).not.toMatch(/^\//);
    }
  });

  test("un lien symbolique interne (résout dans le dossier analysé) est suivi normalement", () => {
    const root = makeScratchDir("recognaize-read-root-");
    mkdirSync(join(root, "code"));
    const realFile = join(root, "code", "real.txt");
    writeFileSync(realFile, "contenu interne\n", "utf8");
    const linkPath = join(root, "code", "link.txt");
    symlinkSync(realFile, linkPath);

    const result = readBoundedText(root, linkPath);

    expect(result).toEqual({ ok: true, data: "contenu interne\n" });
  });
});

describe("readBoundedText — taille bornée", () => {
  test("un fichier de plus de 2 Mo est ignoré, sans jamais lire son contenu intégral", () => {
    const root = makeScratchDir("recognaize-read-root-");
    mkdirSync(join(root, "code"));
    const bigFile = join(root, "code", "huge.txt");
    writeFileSync(bigFile, Buffer.alloc(3_000_000, "x"));

    const result = readBoundedText(root, bigFile);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("file_too_large");
      expect(result.warning.file).toBe(join("code", "huge.txt"));
      expect(result.warning.cause).toContain("3000000");
    }
  });

  test("un fichier de 2 Mo pile (limite incluse) est lu normalement", () => {
    const root = makeScratchDir("recognaize-read-root-");
    const exactFile = join(root, "exact.txt");
    writeFileSync(exactFile, Buffer.alloc(MAX_FILE_BYTES, "a"));

    const result = readBoundedText(root, exactFile);

    expect(result.ok).toBe(true);
  });
});

describe("readTextTreeBounded — plafond de 200 fichiers texte", () => {
  test("chaque cas de borne/rejet est listé dans warnings[], et le plafond stoppe la suite de l'arborescence", () => {
    const outsideDir = makeScratchDir("recognaize-read-outside-");

    const root = makeScratchDir("recognaize-read-root-");
    const codeDir = join(root, "code");
    mkdirSync(codeDir);

    // Trois cas de rejet, nommés pour être traités AVANT les fichiers légitimes
    // (tri par points de code : "00-*" < "01-*").
    symlinkSync(outsideDir, join(codeDir, "00-symlink"));
    writeFileSync(join(codeDir, "00-oversized.bin"), Buffer.alloc(3_000_000, "x"));
    writeFileSync(join(codeDir, "00-binary.dat"), Buffer.from([0x00, 0x01, 0x02, 0xff, 0x00]));

    // 205 fichiers texte légitimes : le plafond de 200 doit en retenir
    // exactement les 200 premiers (tri déterministe) et ignorer les 5 derniers
    // sans avertissement individuel pour chacun.
    const legitCount = 205;
    for (let i = 0; i < legitCount; i += 1) {
      const name = `01-file-${String(i).padStart(3, "0")}.txt`;
      writeFileSync(join(codeDir, name), `contenu ${i}\n`, "utf8");
    }

    const result = readTextTreeBounded(root, codeDir, 200);

    expect(result.files).toHaveLength(200);
    expect(result.files[0]?.relPath).toBe(join("code", "01-file-000.txt"));
    expect(result.files[199]?.relPath).toBe(join("code", "01-file-199.txt"));
    // Les 5 fichiers restants (200..204) n'ont jamais été atteints.
    expect(result.files.some((f) => f.relPath.endsWith("01-file-200.txt"))).toBe(false);

    const codes = result.warnings.map((w) => w.code).sort();
    expect(codes).toEqual([
      "file_too_large",
      "non_text_skipped",
      "symlink_escapes_root",
      "text_file_cap_reached",
    ]);

    const capWarning = result.warnings.find((w) => w.code === "text_file_cap_reached");
    expect(capWarning?.cause).toContain("200");
  });

  test("un fichier binaire ne compte pas dans le plafond de fichiers texte", () => {
    const root = makeScratchDir("recognaize-read-root-");
    const codeDir = join(root, "code");
    mkdirSync(codeDir);
    writeFileSync(join(codeDir, "image.bin"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));
    writeFileSync(join(codeDir, "readme.txt"), "bonjour\n", "utf8");

    const result = readTextTreeBounded(root, codeDir, 200);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.relPath).toBe(join("code", "readme.txt"));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe("non_text_skipped");
  });
});

describe("readdirSorted", () => {
  test("trie par points de code (pas localeCompare) après readdir", () => {
    const root = makeScratchDir("recognaize-read-root-");
    // Les noms de fichiers ne DOIVENT PAS différer uniquement par la casse
    // d'une même lettre (ex. "A.txt"/"a.txt") — APFS (défaut macOS) est
    // insensible à la casse mais la préserve : le second `writeFileSync`
    // écraserait silencieusement le premier fichier au lieu d'en créer un
    // second, réduisant le jeu de 5 à 3 entrées et faisant échouer
    // l'assertion pour une raison sans rapport avec `readdirSorted` lui-même
    // (dont le tri par points de code, lui, reste correct).
    // Lettres toutes distinctes ci-dessous (A, B, y, z — jamais la même lettre en 2 casses) :
    // la propriété testée (tout majuscule < tout minuscule en points de code, contrairement
    // à un tri localisé qui les entrelacerait par lettre) reste démontrée sans dépendre d'un
    // système de fichiers sensible à la casse.
    for (const name of ["z.txt", "A.txt", "y.txt", "B.txt", "1.txt"]) {
      writeFileSync(join(root, name), "x", "utf8");
    }

    const sorted = readdirSorted(root);

    // Ordre par points de code : chiffres < majuscules < minuscules en ASCII.
    expect(sorted).toEqual(["1.txt", "A.txt", "B.txt", "y.txt", "z.txt"]);
  });
});

describe("readBoundedText — BOM UTF-8 et CRLF (cas routinier, PAS hostile)", () => {
  test("un JSON précédé d'un BOM UTF-8 et en CRLF est lu normalement, sans avertissement", () => {
    const root = makeScratchDir("recognaize-read-root-");
    const jsonBody = '{\r\n  "profile_id": "test"\r\n}\r\n';
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(jsonBody, "utf8")]);
    const filePath = join(root, "profile.json");
    writeFileSync(filePath, withBom);

    const result = readBoundedText(root, filePath);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // BOM retiré, CRLF normalisé en LF, aucun avertissement produit.
      expect(result.data).toBe('{\n  "profile_id": "test"\n}\n');
      expect(() => JSON.parse(result.data)).not.toThrow();
      expect(JSON.parse(result.data)).toEqual({ profile_id: "test" });
    }
  });

  test("la fixture réelle fixtures/hostile/profile.json (BOM + CRLF) est lue sans avertissement", () => {
    const hostileRoot = resolve(REPO_ROOT, "fixtures", "hostile");
    const profilePath = join(hostileRoot, "profile.json");

    const result = readBoundedText(hostileRoot, profilePath);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed: unknown = JSON.parse(result.data);
      expect(parsed).toMatchObject({ profile_id: "hostile-fixture-🤖" });
    }
  });

  test("espaces insécables normalisés en espace normal", () => {
    const root = makeScratchDir("recognaize-read-root-");
    const filePath = join(root, "notes.txt");
    // U+00A0 (NBSP), U+2007 (FIGURE SPACE), U+202F (NARROW NO-BREAK SPACE).
    const withNbsp = `avant${String.fromCharCode(0x00a0)}apres${String.fromCharCode(0x2007)}encore${String.fromCharCode(0x202f)}fin`;
    writeFileSync(filePath, withNbsp, "utf8");

    const result = readBoundedText(root, filePath);

    expect(result).toEqual({ ok: true, data: "avant apres encore fin" });
  });
});

describe("readBoundedText — UTF-16", () => {
  test("un fichier UTF-16LE avec BOM est correctement décodé", () => {
    const root = makeScratchDir("recognaize-read-root-");
    const text = "bonjour le monde";
    const withBom = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
    const filePath = join(root, "session.md");
    writeFileSync(filePath, withBom);

    const result = readBoundedText(root, filePath);

    expect(result).toEqual({ ok: true, data: text });
  });

  test("un fichier UTF-16BE avec BOM est correctement décodé", () => {
    const root = makeScratchDir("recognaize-read-root-");
    const text = "bonjour le monde";
    const leBytes = Buffer.from(text, "utf16le");
    const beBytes = Buffer.alloc(leBytes.length);
    for (let i = 0; i + 1 < leBytes.length; i += 2) {
      beBytes[i] = leBytes[i + 1]!;
      beBytes[i + 1] = leBytes[i]!;
    }
    const withBom = Buffer.concat([Buffer.from([0xfe, 0xff]), beBytes]);
    const filePath = join(root, "session.md");
    writeFileSync(filePath, withBom);

    const result = readBoundedText(root, filePath);

    expect(result).toEqual({ ok: true, data: text });
  });

  test("un fichier UTF-16 SANS BOM est traité comme illisible, avec avertissement (pas de devinette)", () => {
    const root = makeScratchDir("recognaize-read-root-");
    const text = "bonjour le monde, ceci est un texte assez long pour l'heuristique";
    const noBom = Buffer.from(text, "utf16le");
    const filePath = join(root, "session.md");
    writeFileSync(filePath, noBom);

    const result = readBoundedText(root, filePath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("encoding_unreadable");
      expect(result.warning.file).toBe("session.md");
    }
  });
});

describe("frontière défensive — aucune exception ne traverse jamais read.ts", () => {
  test("readBoundedText : une erreur fs totalement imprévue (chemin avec octet nul) est capturée, pas relancée", () => {
    const root = makeScratchDir("recognaize-read-root-");
    // Un octet nul dans un chemin fait lever une TypeError synchrone depuis les
    // internals de node:fs (ERR_INVALID_ARG_VALUE) — un cas qu'aucune branche de
    // read.ts n'anticipe explicitement. Le filet défensif final doit la capturer.
    const hostilePath = join(root, `evil${String.fromCharCode(0)}name.txt`);

    expect(() => readBoundedText(root, hostilePath)).not.toThrow();
    const result = readBoundedText(root, hostilePath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("read_error");
    }
  });

  test("readTextTreeBounded : la même erreur imprévue sur le sous-arbre lui-même est capturée, pas relancée", () => {
    const root = makeScratchDir("recognaize-read-root-");
    const hostileSubtree = join(root, `evil${String.fromCharCode(0)}dir`);

    expect(() => readTextTreeBounded(root, hostileSubtree, 200)).not.toThrow();
    const result = readTextTreeBounded(root, hostileSubtree, 200);
    expect(result.files).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe("read_error");
  });

  test("readBoundedText : un dossier passé à la place d'un fichier ne lève pas, produit un avertissement", () => {
    const root = makeScratchDir("recognaize-read-root-");
    const subdir = join(root, "code");
    mkdirSync(subdir);

    const result = readBoundedText(root, subdir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("read_error");
    }
  });

  test("readBoundedText : fichier absent (ENOENT) — la cause ne contient jamais le chemin absolu de la machine (régression revue indépendante 2026-08-29)", () => {
    const root = makeScratchDir("recognaize-read-root-");
    const missingPath = join(root, "session.md");

    const result = readBoundedText(root, missingPath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("read_error");
      expect(result.warning.file).toBe("session.md");
      expect(result.warning.cause).not.toContain(root);
      expect(result.warning.cause).not.toContain(missingPath);
      expect(result.warning.cause).not.toMatch(/^\//);
    }
  });
});

/**
 * Garde contre un échappement par répertoire ANCÊTRE symlinké :
 * `checkSymlinkSafety` doit `lstat`er chaque composant du chemin, pas
 * seulement le dernier — si un répertoire ANCÊTRE (ex. `repo-context/`
 * lui-même) est un lien symbolique résolvant hors du dossier analysé, un
 * fichier ORDINAIRE (pas lui-même un lien) lu à travers cet ancêtre ne doit
 * jamais passer la garde sans avertissement (son contenu pourrait sinon
 * influencer réellement le rang). Ces cas couvrent CHAQUE point d'entrée qui
 * résout un chemin sous un profil (`readBoundedText` pour une pièce nommée,
 * `readTextTreeBounded` pour une arborescence bornée) avec le répertoire
 * ancêtre symlinké AU LIEU DU fichier/sous-arbre final — le cas non couvert par
 * les tests d'échappement existants ci-dessus (qui symlinkent la FEUILLE).
 */
describe("échappement par répertoire ANCÊTRE symlinké — pas seulement le composant final (régression revue indépendante 2026-08-29)", () => {
  test("readBoundedText : un fichier ORDINAIRE (pas un lien) atteint via un répertoire ancêtre symlinké hors racine est refusé, avec avertissement explicite", () => {
    const outsideDir = makeScratchDir("recognaize-read-outside-");
    writeFileSync(join(outsideDir, "AGENTS.md"), "contenu externe — ne doit jamais être lu\n", "utf8");

    const root = makeScratchDir("recognaize-read-root-");
    symlinkSync(outsideDir, join(root, "repo-context"));
    const targetPath = join(root, "repo-context", "AGENTS.md");

    const result = readBoundedText(root, targetPath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("symlink_escapes_root");
      expect(result.warning.file).toBe(join("repo-context", "AGENTS.md"));
      expect(result.warning.cause).not.toContain(outsideDir);
      expect(result.warning.cause).not.toMatch(/^\//);
    }
  });

  test("readTextTreeBounded : le sous-arbre demandé (`subtreeAbs`) est LUI-MÊME un lien symbolique résolvant hors racine — bloqué avant tout `readdir`, avertissement explicite", () => {
    const outsideDir = makeScratchDir("recognaize-read-outside-");
    writeFileSync(join(outsideDir, "leaky.txt"), "secret externe\n", "utf8");

    const root = makeScratchDir("recognaize-read-root-");
    const linkedSubtree = join(root, "repo-context");
    symlinkSync(outsideDir, linkedSubtree);

    const result = readTextTreeBounded(root, linkedSubtree, 200);

    expect(result.files).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe("symlink_escapes_root");
    expect(result.warnings[0]?.file).toBe("repo-context");
    expect(result.warnings[0]?.cause).not.toContain(outsideDir);
  });

  test("readTextTreeBounded : un sous-dossier CONNU atteint via un ancêtre symlinké hors racine (`repo-context/.claude/agents`) est bloqué, pas seulement `repo-context/` lui-même", () => {
    const outsideDir = makeScratchDir("recognaize-read-outside-");
    mkdirSync(join(outsideDir, ".claude", "agents"), { recursive: true });
    writeFileSync(join(outsideDir, ".claude", "agents", "leaky-agent.md"), "# agent externe\n", "utf8");

    const root = makeScratchDir("recognaize-read-root-");
    symlinkSync(outsideDir, join(root, "repo-context"));
    const nestedSubtree = join(root, "repo-context", ".claude", "agents");

    const result = readTextTreeBounded(root, nestedSubtree, 200);

    expect(result.files).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe("symlink_escapes_root");
    expect(result.warnings[0]?.cause).not.toContain(outsideDir);
  });

  test("readBoundedText : un lien symbolique interne dont un ANCÊTRE (pas la feuille) est symlinké reste suivi normalement (pas de faux positif)", () => {
    const root = makeScratchDir("recognaize-read-root-");
    mkdirSync(join(root, "real-context"));
    writeFileSync(join(root, "real-context", "AGENTS.md"), "contenu interne légitime\n", "utf8");
    symlinkSync(join(root, "real-context"), join(root, "repo-context"));

    const result = readBoundedText(root, join(root, "repo-context", "AGENTS.md"));

    expect(result).toEqual({ ok: true, data: "contenu interne légitime\n" });
  });
});

/**
 * Garde contre un `relPath` pollué par un DOSSIER ANALYSÉ lui-même atteint via
 * un ancêtre symlinké : `walk()` part du chemin RÉEL (`realpathSync`) du
 * sous-arbre analysé, mais `relPath` doit être calculé contre cette même
 * racine résolue, jamais contre la racine LEXICALE (non résolue) — sinon,
 * dès que le DOSSIER ANALYSÉ LUI-MÊME (pas un sous-dossier interne) est
 * atteint via un chemin traversant un symlink (cas standard : `TMPDIR`
 * symlinké sur macOS, `/tmp` -> `/private/tmp`, donc TOUT `os.tmpdir()`),
 * `relPath` s'échappe de la racine attendue et embarque des segments du
 * système de fichiers hôte (ex. `"code/01-file-000.txt"` attendu,
 * `"../../realtmp/recognaize-read-root-mfeWV2/code/01-file-000.txt"` reçu).
 * Reproduit ici PORTABLEMENT (sans dépendre de `TMPDIR` du process, qui est
 * figé au démarrage de Node) : un répertoire réel puis un lien symbolique VERS
 * ce répertoire, tous deux sous le tmpdir du système ; `root` passé à
 * `readTextTreeBounded` est le chemin qui TRAVERSE ce lien — exactement le cas
 * où `os.tmpdir()` lui-même serait un symlink.
 */
describe("relPath reste propre même si le DOSSIER ANALYSÉ lui-même est atteint via un ancêtre symlinké (régression revue indépendante passe 3, 2026-08-29 — équivalent TMPDIR symlinké macOS)", () => {
  test("readTextTreeBounded : `root` traverse un lien symbolique — relPath propre (\"code/…\"), jamais de segment `..` ni de chemin absolu", () => {
    const realBase = makeScratchDir("recognaize-real-");
    const symBase = `${realBase}-sym`;
    symlinkSync(realBase, symBase);
    scratchDirs.push(symBase); // le lien lui-même ; rmSync ne suit pas le lien pour recurse.

    // `root` (le dossier de profil analysé) est construit et référencé
    // EXCLUSIVEMENT via le chemin symlinké — jamais via `realBase` — pour
    // reproduire fidèlement « le dossier analysé lui-même est atteint via un
    // chemin traversant un symlink ».
    const root = join(symBase, "profile");
    const codeDir = join(root, "code");
    mkdirSync(codeDir, { recursive: true });
    writeFileSync(join(codeDir, "01-file-000.txt"), "contenu 0\n", "utf8");
    writeFileSync(join(codeDir, "01-file-001.txt"), "contenu 1\n", "utf8");
    mkdirSync(join(codeDir, "nested"));
    writeFileSync(join(codeDir, "nested", "02-file.txt"), "contenu imbriqué\n", "utf8");

    const result = readTextTreeBounded(root, codeDir, 200);

    expect(result.warnings).toEqual([]);
    expect(result.files.map((f) => f.relPath).sort()).toEqual(
      [
        join("code", "01-file-000.txt"),
        join("code", "01-file-001.txt"),
        join("code", "nested", "02-file.txt"),
      ].sort(),
    );
    for (const file of result.files) {
      expect(file.relPath.split(/[/\\]/)).not.toContain("..");
      expect(isAbsolute(file.relPath)).toBe(false);
      expect(file.relPath).not.toContain(realBase);
      expect(file.relPath).not.toContain(symBase);
    }
  });

  test("readTextTreeBounded : l'échappement (sous-arbre symlinké hors racine) reste bloqué même quand la racine elle-même traverse un ancêtre symlinké — ne pas relâcher la protection en corrigeant le calcul de relPath", () => {
    const realBase = makeScratchDir("recognaize-real-");
    const symBase = `${realBase}-sym`;
    symlinkSync(realBase, symBase);
    scratchDirs.push(symBase);

    const outsideDir = makeScratchDir("recognaize-read-outside-");
    writeFileSync(join(outsideDir, "leaky.txt"), "secret externe\n", "utf8");

    const root = join(symBase, "profile");
    mkdirSync(root, { recursive: true });
    const linkedSubtree = join(root, "repo-context");
    symlinkSync(outsideDir, linkedSubtree);

    const result = readTextTreeBounded(root, linkedSubtree, 200);

    expect(result.files).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe("symlink_escapes_root");
    expect(result.warnings[0]?.file).toBe("repo-context");
    expect(result.warnings[0]?.cause).not.toContain(outsideDir);
  });
});
