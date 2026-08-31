// Contract tests pour `src/sources/sonar.ts`.
// Couvre les 4 fixtures réelles, la conversion 0-100 → 0-1 (`coverage`,
// `duplicated_lines_density`), `bugs` en compte entier, un métrique manquant ⇒
// « non évalué » (silence), une valeur non numérique ⇒ avertissement, et les
// formes top-level cassées (`component` absent, `measures` non-tableau, JSON
// invalide) — jamais d'exception. Vérifie aussi, par grep, que la conversion
// 0-100 → 0-1 n'existe nulle part ailleurs dans `src/`.

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { loadSonarMeasures } from "../../src/sources/sonar.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "profiles");
const REAL_PROFILES = ["bohort", "arthur", "leodagan", "perceval"] as const;

const scratchDirs: string[] = [];

function makeScratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "recognaize-sonar-"));
  scratchDirs.push(dir);
  return dir;
}

function writeSonar(dir: string, content: string): void {
  writeFileSync(join(dir, "sonar-measures.json"), content, "utf8");
}

afterEach(() => {
  while (scratchDirs.length > 0) {
    const dir = scratchDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("loadSonarMeasures — les 4 fixtures réelles", () => {
  for (const profile of REAL_PROFILES) {
    test(`${profile}/sonar-measures.json ne produit aucun avertissement inattendu`, () => {
      const result = loadSonarMeasures(join(FIXTURES_DIR, profile));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.warnings).toEqual([]);
        expect(result.data.measures.coverage).toBeGreaterThanOrEqual(0);
        expect(result.data.measures.coverage).toBeLessThanOrEqual(1);
      }
    });
  }

  test("bohort : coverage 61.0 → 0.61, duplicated_lines_density 5.8 → 0.058, bugs 0", () => {
    const result = loadSonarMeasures(join(FIXTURES_DIR, "bohort"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.measures.coverage).toBeCloseTo(0.61);
      expect(result.data.measures.duplicated_lines_density).toBeCloseTo(0.058);
      expect(result.data.measures.bugs).toBe(0);
      expect(result.data.measures.ncloc).toBe(36162);
      expect(result.data.componentKey).toBe("acme:invoicing");
      expect(result.data.language).toBe("ts");
    }
  });

  test("perceval : coverage 37.0 → 0.37, bugs 212 (compte entier)", () => {
    const result = loadSonarMeasures(join(FIXTURES_DIR, "perceval"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.measures.coverage).toBeCloseTo(0.37);
      expect(result.data.measures.bugs).toBe(212);
      expect(Number.isInteger(result.data.measures.bugs)).toBe(true);
    }
  });

  test('coverage "85.0" (chaîne) → 0.85 exactement (arthur)', () => {
    const result = loadSonarMeasures(join(FIXTURES_DIR, "arthur"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.measures.coverage).toBe(0.85);
    }
  });
});

describe("loadSonarMeasures — métrique manquant = non évalué (silence)", () => {
  test("measures[] sans 'coverage' ⇒ coverage undefined, sans avertissement", () => {
    const dir = makeScratchDir();
    writeSonar(
      dir,
      JSON.stringify({
        component: {
          key: "x:y",
          measures: [{ metric: "bugs", value: "3" }],
        },
      }),
    );

    const result = loadSonarMeasures(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.measures.coverage).toBeUndefined();
      expect(result.data.measures.bugs).toBe(3);
      expect(result.warnings).toEqual([]);
    }
  });
});

describe("loadSonarMeasures — champ présent mais invalide", () => {
  test("coverage non numérique ⇒ inconnu, avertissement nommant le métrique", () => {
    const dir = makeScratchDir();
    writeSonar(
      dir,
      JSON.stringify({
        component: { measures: [{ metric: "coverage", value: "pas un nombre" }] },
      }),
    );

    const result = loadSonarMeasures(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.measures.coverage).toBeUndefined();
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.cause).toContain("coverage");
    }
  });

  test("coverage hors bornes (150) ⇒ inconnu, avertissement", () => {
    const dir = makeScratchDir();
    writeSonar(dir, JSON.stringify({ component: { measures: [{ metric: "coverage", value: "150" }] } }));

    const result = loadSonarMeasures(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.measures.coverage).toBeUndefined();
      expect(result.warnings).toHaveLength(1);
    }
  });

  test("bugs non entier (3.5) ⇒ inconnu, avertissement", () => {
    const dir = makeScratchDir();
    writeSonar(dir, JSON.stringify({ component: { measures: [{ metric: "bugs", value: "3.5" }] } }));

    const result = loadSonarMeasures(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.measures.bugs).toBeUndefined();
    }
  });

  test("entrée measures[] mal formée (pas d'objet, ou sans metric/value) est simplement ignorée", () => {
    const dir = makeScratchDir();
    writeSonar(
      dir,
      JSON.stringify({
        component: {
          measures: ["pas un objet", { noMetric: true }, { metric: "bugs", value: "1" }],
        },
      }),
    );

    const result = loadSonarMeasures(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.measures.bugs).toBe(1);
    }
  });
});

describe("loadSonarMeasures — pièce entière illisible", () => {
  test("JSON invalide ⇒ {ok:false, warning}, jamais d'exception", () => {
    const dir = makeScratchDir();
    writeSonar(dir, "{ pas du JSON");

    expect(() => loadSonarMeasures(dir)).not.toThrow();
    const result = loadSonarMeasures(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("invalid_json");
    }
  });

  test("'component' absent ⇒ {ok:false, warning}", () => {
    const dir = makeScratchDir();
    writeSonar(dir, JSON.stringify({ analysedAt: "2026-07-14T22:06:39+0000" }));

    const result = loadSonarMeasures(dir);
    expect(result.ok).toBe(false);
  });

  test("'component.measures' n'est pas un tableau ⇒ {ok:false, warning}", () => {
    const dir = makeScratchDir();
    writeSonar(dir, JSON.stringify({ component: { measures: "pas un tableau" } }));

    const result = loadSonarMeasures(dir);
    expect(result.ok).toBe(false);
  });

  test("fichier absent ⇒ {ok:false, warning}, jamais d'exception", () => {
    const dir = makeScratchDir();

    expect(() => loadSonarMeasures(dir)).not.toThrow();
    const result = loadSonarMeasures(dir);
    expect(result.ok).toBe(false);
  });
});

// Complète le jeu des 8 cas hostiles. Invalid JSON et champ
// mal typé sont déjà couverts plus haut. Top-level tableau (au lieu d'objet),
// `null`, BOM/UTF-16, fichier de 3 Mo, symlink sortant et un champ inconnu au
// niveau top-level manquaient pour cet adaptateur.
describe("loadSonarMeasures — Phase 4 : cas de contrat additionnels", () => {
  test("top-level un tableau (pas un objet) ⇒ {ok:false, warning not_object}", () => {
    const dir = makeScratchDir();
    writeSonar(dir, JSON.stringify([1, 2, 3]));

    const result = loadSonarMeasures(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("not_object");
    }
  });

  test("contenu top-level `null` (JSON valide, pas un objet) ⇒ {ok:false, warning}, jamais d'exception", () => {
    const dir = makeScratchDir();
    writeSonar(dir, "null");

    expect(() => loadSonarMeasures(dir)).not.toThrow();
    const result = loadSonarMeasures(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("not_object");
    }
  });

  test("sonar-measures.json précédé d'un BOM UTF-8 est lu et parsé normalement", () => {
    const dir = makeScratchDir();
    const body = JSON.stringify({ component: { measures: [{ metric: "bugs", value: "1" }] } });
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf8")]);
    writeFileSync(join(dir, "sonar-measures.json"), withBom);

    const result = loadSonarMeasures(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.measures.bugs).toBe(1);
      expect(result.warnings).toEqual([]);
    }
  });

  test("sonar-measures.json en UTF-16 sans BOM ⇒ {ok:false, warning encoding_unreadable} propagé, jamais d'exception", () => {
    const dir = makeScratchDir();
    const text = JSON.stringify({ note: "texte assez long pour l'heuristique de détection UTF-16 sans BOM" });
    writeFileSync(join(dir, "sonar-measures.json"), Buffer.from(text, "utf16le"));

    expect(() => loadSonarMeasures(dir)).not.toThrow();
    const result = loadSonarMeasures(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("encoding_unreadable");
    }
  });

  test("sonar-measures.json de plus de 2 Mo ⇒ {ok:false, warning file_too_large}, jamais lu en entier", () => {
    const dir = makeScratchDir();
    writeFileSync(join(dir, "sonar-measures.json"), Buffer.alloc(3_000_001, "x"));

    expect(() => loadSonarMeasures(dir)).not.toThrow();
    const result = loadSonarMeasures(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("file_too_large");
    }
  });

  test("sonar-measures.json comme lien symbolique sortant du dossier analysé ⇒ {ok:false, warning symlink_escapes_root}", () => {
    const outsideDir = makeScratchDir();
    const secret = join(outsideDir, "secret-sonar.json");
    writeFileSync(secret, JSON.stringify({ component: { measures: [] } }), "utf8");

    const dir = makeScratchDir();
    symlinkSync(secret, join(dir, "sonar-measures.json"));

    expect(() => loadSonarMeasures(dir)).not.toThrow();
    const result = loadSonarMeasures(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.code).toBe("symlink_escapes_root");
    }
  });

  test("champ top-level totalement inconnu est simplement ignoré (passthrough tolérant)", () => {
    const dir = makeScratchDir();
    writeSonar(
      dir,
      JSON.stringify({
        component: { key: "x:y", measures: [{ metric: "bugs", value: "2" }] },
        un_champ_du_futur_pas_encore_documente: { x: [1, 2, 3] },
      }),
    );

    const result = loadSonarMeasures(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.measures.bugs).toBe(2);
      expect(result.warnings).toEqual([]);
    }
  });
});

describe("loadSonarMeasures — normalisation 0-100 → 0-1 isolée dans sonar.ts", () => {
  test("aucun autre fichier de src/ ne référence les métriques Sonar 0-100 normalisées ici (grep de contrôle)", () => {
    // `coverage`/`duplicated_lines_density` sont les 2 seuls champs convertis
    // 0-100 → 0-1 ; ce grep prouve qu'aucun autre fichier ne les touche (donc
    // ne peut pas dupliquer la conversion). Un `grep -rnE '/ *100'` générique
    // serait un faux positif : `core/judge.ts` arrondit une confiance à 2
    // décimales (`Math.round(x * 100) / 100`) sans rapport avec Sonar.
    //
    // `src/lib/quality-badge.ts` (badge qualité informatif, `O2.sonar.ts`)
    // lit `measures.duplicated_lines_density` — déjà normalisé en ratio
    // `[0;1]` par `sonar.ts` — sans jamais dupliquer la conversion 0-100→0-1
    // elle-même (aucune division par 100, aucun appel à
    // `toRatioFromPercent`). Exclu explicitement, même principe que
    // `sonar.ts` lui-même : une LECTURE du champ déjà normalisé n'est pas une
    // duplication de la conversion, seule chose que ce garde-fou interdit.
    const grepOutput = execSync(
      String.raw`grep -rlE 'duplicated_lines_density|toRatioFromPercent' --include=*.ts src | grep -v '^src/sources/sonar\.ts$' | grep -v '^src/lib/quality-badge\.ts$' || true`,
      { cwd: REPO_ROOT, encoding: "utf8" },
    );

    expect(grepOutput.trim()).toBe("");
  });
});
