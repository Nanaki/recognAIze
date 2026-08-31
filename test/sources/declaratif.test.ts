// Contract tests pour `src/sources/declaratif.ts`.
// Couvre : les 3 fixtures réelles avec `declaratif.md` (perceval, bohort,
// leodagan — arthur n'en a pas), le symptôme « manque de contexte » sur
// `perceval` (contient littéralement les deux phrases déclenchantes),
// l'indice négatif P2 sur `leodagan` (« un fil à la fois »), un fichier sans
// réponse exploitable ⇒ « non renseigné », et `declaratif.md` absent.

import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { loadDeclaratif } from "../../src/sources/declaratif.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "profiles");
const FIXTURES_HOSTILE_DIR = join(REPO_ROOT, "fixtures", "hostile");

const scratchDirs: string[] = [];

function makeScratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "recognaize-declaratif-"));
  scratchDirs.push(dir);
  return dir;
}

function writeDeclaratif(dir: string, content: string): void {
  writeFileSync(join(dir, "declaratif.md"), content, "utf8");
}

afterEach(() => {
  while (scratchDirs.length > 0) {
    const dir = scratchDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("loadDeclaratif — les 3 fixtures réelles avec declaratif.md", () => {
  for (const profile of ["perceval", "bohort", "leodagan"] as const) {
    test(`${profile}/declaratif.md est répondu et parsé`, () => {
      const result = loadDeclaratif(join(FIXTURES_DIR, profile));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.answered).toBe(true);
      expect(result.data.qas.length).toBeGreaterThan(0);
      expect(result.data.selfEstimatedLevel).toBeDefined();
    });
  }

  test("arthur n'a pas de declaratif.md : {ok:false}", () => {
    const result = loadDeclaratif(join(FIXTURES_DIR, "arthur"));
    expect(result.ok).toBe(false);
  });
});

describe("loadDeclaratif — symptôme « manque de contexte »", () => {
  test("perceval : les deux phrases déclenchantes produisent le symptôme dans le miroir", () => {
    const result = loadDeclaratif(join(FIXTURES_DIR, "perceval"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const symptom = result.data.symptoms.find((s) => s.id === "manque_de_contexte");
    expect(symptom).toBeDefined();
    expect(symptom?.quotes.length).toBe(2);
  });

  test("un texte synthétique contenant les deux phrases déclenche aussi le symptôme", () => {
    const dir = makeScratchDir();
    writeDeclaratif(
      dir,
      [
        "**Un truc qui te frustre ?**",
        "",
        "Il oublie ce qu'on s'est dit deux messages plus tôt, et il réinvente des trucs qui existent déjà.",
        "",
      ].join("\n"),
    );

    const result = loadDeclaratif(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.symptoms.map((s) => s.id)).toContain("manque_de_contexte");
  });

  test("un texte sans ces phrases ne déclenche pas le symptôme", () => {
    const dir = makeScratchDir();
    writeDeclaratif(dir, ["**Un truc qui te frustre ?**", "", "Rien de particulier, ça se passe bien.", ""].join("\n"));

    const result = loadDeclaratif(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.symptoms).toEqual([]);
  });
});

describe("loadDeclaratif — indice négatif « un fil à la fois » (P2)", () => {
  test("leodagan : l'indice négatif est enregistré avec confiance_source = 0", () => {
    const result = loadDeclaratif(join(FIXTURES_DIR, "leodagan"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hint = result.data.negativeHints.find((h) => h.id === "single_threaded_declared");
    expect(hint).toBeDefined();
    expect(hint?.confianceSource).toBe(0);
  });

  test("bohort et perceval ne déclarent pas travailler un fil à la fois : pas d'indice négatif", () => {
    for (const profile of ["bohort", "perceval"] as const) {
      const result = loadDeclaratif(join(FIXTURES_DIR, profile));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.data.negativeHints.map((h) => h.id)).not.toContain("single_threaded_declared");
    }
  });
});

describe("loadDeclaratif — non renseigné", () => {
  test("un fichier sans aucune réponse exploitable produit answered:false, sans erreur", () => {
    const dir = makeScratchDir();
    writeDeclaratif(
      dir,
      [
        "**Comment utilises-tu l'IA au quotidien ?**",
        "",
        "**Quel est ton niveau selon toi ?**",
        "",
        "**Un truc qui te frustre ?**",
        "",
      ].join("\n"),
    );

    const result = loadDeclaratif(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.answered).toBe(false);
    expect(result.data.symptoms).toEqual([]);
    expect(result.data.negativeHints).toEqual([]);
    expect(result.warnings.some((w) => w.code === "not_answered")).toBe(true);
  });

  test("un fichier sans aucun bloc reconnu (prose libre) produit aussi answered:false", () => {
    const dir = makeScratchDir();
    writeDeclaratif(dir, "Pas de questionnaire ici, juste une note libre.\n");

    const result = loadDeclaratif(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.answered).toBe(false);
  });
});

/**
 * Complète le jeu des 8 cas hostiles pour `declaratif.ts`.
 *
 * `declaratif.md` est du MARKDOWN, pas du JSON : « invalid JSON » et « array
 * vs objet » n'ont pas de sens ici (aucun `JSON.parse` n'a jamais lieu) —
 * délibérément SKIPPÉS. « champ inconnu »/« champ mal typé » n'ont pas de sens
 * non plus (questionnaire libre, pas de schéma de champs) — déjà couverts en
 * substance par « non renseigné » ci-dessus. Le cas « `null` » est réinterprété
 * comme contenu littéral `null` (prose non structurée). BOM/UTF-16, fichier de
 * 3 Mo et symlink sortant restent pleinement applicables.
 */
describe("loadDeclaratif — Phase 4 : cas de contrat additionnels", () => {
  test("contenu littéral 'null' (texte, pas JSON) ⇒ non renseigné, jamais d'exception", () => {
    const dir = makeScratchDir();
    writeDeclaratif(dir, "null");

    expect(() => loadDeclaratif(dir)).not.toThrow();
    const result = loadDeclaratif(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.answered).toBe(false);
  });

  test("declaratif.md précédé d'un BOM UTF-8 est décodé puis les questions/réponses sont reconnues normalement", () => {
    const dir = makeScratchDir();
    const body = "**Un truc qui te frustre ?**\n\nRien de particulier.\n";
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf8")]);
    writeFileSync(join(dir, "declaratif.md"), withBom);

    const result = loadDeclaratif(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.answered).toBe(true);
      expect(result.warnings).toEqual([]);
    }
  });

  test("declaratif.md en UTF-16 sans BOM ⇒ {ok:false, warning encoding_unreadable} propagé, jamais d'exception", () => {
    const dir = makeScratchDir();
    const text = "**Un truc qui te frustre ?**\n\nTexte assez long pour l'heuristique UTF-16 sans BOM.\n";
    writeFileSync(join(dir, "declaratif.md"), Buffer.from(text, "utf16le"));

    expect(() => loadDeclaratif(dir)).not.toThrow();
    const result = loadDeclaratif(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("encoding_unreadable");
    }
  });

  test("declaratif.md de plus de 2 Mo ⇒ {ok:false, warning file_too_large}, jamais lu en entier", () => {
    const dir = makeScratchDir();
    writeFileSync(join(dir, "declaratif.md"), Buffer.alloc(3_000_001, "x"));

    expect(() => loadDeclaratif(dir)).not.toThrow();
    const result = loadDeclaratif(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("file_too_large");
    }
  });

  test("declaratif.md comme lien symbolique sortant du dossier analysé ⇒ {ok:false, warning symlink_escapes_root}", () => {
    const outsideDir = makeScratchDir();
    const secret = join(outsideDir, "secret-declaratif.md");
    writeFileSync(secret, "**Un truc qui te frustre ?**\n\nContenu hors dossier analysé.\n", "utf8");

    const dir = makeScratchDir();
    symlinkSync(secret, join(dir, "declaratif.md"));

    expect(() => loadDeclaratif(dir)).not.toThrow();
    const result = loadDeclaratif(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("symlink_escapes_root");
    }
  });

  test("fixture réelle fixtures/hostile/declaratif.md (payload <script>, sans bloc question reconnu) est lue sans exception", () => {
    // Le fichier hostile est de la prose libre (pas de `**Question**` en gras
    // isolée) : aucun bloc question/réponse n'y est reconnu, donc
    // answered:false — comportement identique à « non renseigné », jamais une
    // exception. Le payload <script> reste dans le FICHIER (lu tel quel par
    // read.ts), il ne remonte pas dans les `qas` faute de bloc reconnu ; les
    // tests d'échappement HTML de `report.html` lisent le fichier
    // directement, pas via cette extraction QA.
    expect(() => loadDeclaratif(FIXTURES_HOSTILE_DIR)).not.toThrow();
    const result = loadDeclaratif(FIXTURES_HOSTILE_DIR);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.answered).toBe(false);
  });
});
