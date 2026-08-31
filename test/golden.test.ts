// Golden files des 4 étalons — `test/golden/*.result.json`.
//
// Chaque golden file est une copie figée de `result.json` réellement produit
// par `node dist/cli.js analyze <étalon>` (binaire construit, jamais les
// sources TypeScript directement — même garantie que `test/e2e-jury.test.ts`).
// `as_of` est dérivé des données (jamais de l'horloge, `core/as-of.ts`), donc
// stable ; seul le NOM du fichier `runs/<horodatage>.json` varie run à run —
// il n'est pas comparé ici, n'étant pas du contenu de `result.json`.
//
// `node_version` (`process.versions.node`) n'est jamais comparé tel quel : la
// matrice CI (`.github/workflows/ci.yml`) est Node 20 × Node 22 × Linux ×
// macOS, alors que les golden files figent un seul patch de Node 20 — une
// comparaison stricte serait rouge par construction sur toute jambe qui n'est
// pas exactement ce patch. `node_version` est un fait d'exécution, jamais une
// propriété du profil analysé — il est normalisé (remplacé par un jeton fixe
// des deux côtés) avant `toEqual`, et vérifié séparément par une assertion de
// forme (chaîne non vide, format `major.minor.patch`) plutôt que par une valeur
// figée.
//
// Les golden files sont vérifiés ICI par une comparaison directe au fichier
// committé — équivalent en substance à « rebuild, run, compare » puisque le
// golden LUI-MÊME a été produit par un cycle `npm run build` + run distinct de
// celui-ci. Reconstruire deux fois dans CE test dupliquerait la couverture
// déjà apportée par `test/e2e-jury.test.ts` (clone frais + build +
// déterminisme) pour un coût en temps d'exécution plus élevé.
//
// `readdirSync` limité aux 4 étalons : la fixture `hostile` et les fixtures
// négatives ne sont pas golden-testées ici (avertissements non stabilisés à
// dessein pour rester lisibles humainement dans `test/e2e-jury.test.ts`, pas
// pour un diff byte-à-byte).

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

const TEST_FILE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "..");
const CLI_PATH = join(REPO_ROOT, "dist", "cli.js");

const ETALONS = ["perceval", "bohort", "leodagan", "arthur"] as const;

const scratchDirs: string[] = [];
function makeScratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

beforeAll(() => {
  if (!existsSync(CLI_PATH)) {
    throw new Error(`"${CLI_PATH}" introuvable — lancer \`npm run build\` avant \`vitest run test/golden.test.ts\`.`);
  }
});

function runCliAnalyze(profile: string, outDir: string): void {
  execFileSync(process.execPath, [CLI_PATH, "analyze", join(REPO_ROOT, "fixtures", "profiles", profile), "--out", outDir], {
    encoding: "utf8",
  });
}

function readSingleResultJson(outDir: string): unknown {
  const subjectDirs = readdirSync(outDir);
  expect(subjectDirs).toHaveLength(1);
  const resultPath = join(outDir, subjectDirs[0] ?? "", "result.json");
  return JSON.parse(readFileSync(resultPath, "utf8"));
}

// `node_version` (et tout champ volatile équivalent à l'avenir) : fait
// d'exécution, pas une propriété du profil — normalisé avant comparaison
// golden pour ne pas figer la CI sur un unique patch Node.
const VOLATILE_FIELD_PLACEHOLDER = "<normalized-for-golden-comparison>";
const VOLATILE_FIELDS = ["node_version"] as const;

function normalizeVolatileFields(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...record };
  for (const field of VOLATILE_FIELDS) {
    if (field in normalized) {
      normalized[field] = VOLATILE_FIELD_PLACEHOLDER;
    }
  }
  return normalized;
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+/;

describe("golden : result.json des 4 étalons identique au fichier committé (hors champs volatiles)", () => {
  test.for(ETALONS)("%s : result.json === test/golden/%s.result.json", (profile) => {
    const outDir = makeScratchDir(`recognaize-golden-${profile}-`);
    runCliAnalyze(profile, outDir);
    const actual = readSingleResultJson(outDir);

    const goldenPath = join(TEST_FILE_DIR, "golden", `${profile}.result.json`);
    const golden = JSON.parse(readFileSync(goldenPath, "utf8"));

    expect(normalizeVolatileFields(actual)).toEqual(normalizeVolatileFields(golden));

    // `node_version` n'est pas ignoré : il est vérifié à part, par sa forme
    // (semver), jamais par une valeur figée — vrai quel que soit le patch/la
    // version majeure de Node exécutant ce test (matrice CI Node 20 / 22).
    const actualNodeVersion = (actual as Record<string, unknown>).node_version;
    expect(typeof actualNodeVersion).toBe("string");
    expect(actualNodeVersion as string).toMatch(SEMVER_PATTERN);
    expect(actualNodeVersion).toBe(process.versions.node);
  });

  test.for(ETALONS)("%s : deux exécutions consécutives → result.json strictement identiques", (profile) => {
    const outDirA = makeScratchDir(`recognaize-golden-repeat-a-${profile}-`);
    const outDirB = makeScratchDir(`recognaize-golden-repeat-b-${profile}-`);
    runCliAnalyze(profile, outDirA);
    runCliAnalyze(profile, outDirB);

    const a = readSingleResultJson(outDirA);
    const b = readSingleResultJson(outDirB);
    expect(a).toEqual(b);
  });
});
