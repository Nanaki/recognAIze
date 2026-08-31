// Test e2e « chemin jury » : LE test qui vaut tous les autres.
//
// Reproduit exactement ce qu'un membre du jury ferait sur un clone frais :
//   1. copier le dépôt dans un répertoire temporaire vide,
//   2. `npm ci --ignore-scripts && npm run build`,
//   3. lancer `node dist/cli.js analyze <profil>` — jamais les sources TypeScript —
//      sur les 4 profils étalons, un profil mutilé et un dossier vide,
//   4. vérifier les codes de sortie, la validité JSON de `result.json`, le
//      déterminisme (deux exécutions identiques hors horodatage), et la résolution
//      des chemins internes indépendamment du `cwd` de l'appelant.
//
// Un seul `npm ci` + `npm run build`, partagé par tous les cas via `beforeAll`, pour
// tenir le budget < 90 s — un e2e trop lent décourage son exécution.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

const TEST_FILE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "..");

// Le clone/build partagé peut légitimement prendre plus que le testTimeout par
// défaut (`vitest.config.ts` le porte à 120s, mais les hooks ont leur propre
// budget par défaut, plus court) — on le rend explicite ici.
const BUILD_HOOK_TIMEOUT_MS = 80_000;

/** Sous-arborescences jamais copiées dans le clone temporaire du jury. */
const EXCLUDED_TOP_LEVEL_ENTRIES = new Set(["node_modules", "dist", ".git", "recognaize-cli-out"]);

let tmpRepoDir: string;
let cliPath: string;
let mutilatedBohortDir: string;
let emptyProfileDir: string;
const scratchDirs: string[] = [];

/** Copie tout le dépôt vers `destDir`, hors node_modules/dist/.git/recognaize-cli-out. */
function copyRepoInto(destDir: string): void {
  cpSync(REPO_ROOT, destDir, {
    recursive: true,
    filter: (source) => {
      const relativeToRoot = source.slice(REPO_ROOT.length).replace(/^[/\\]/, "");
      if (relativeToRoot === "") {
        return true;
      }
      const topLevel = relativeToRoot.split(/[/\\]/, 1)[0];
      return !EXCLUDED_TOP_LEVEL_ENTRIES.has(topLevel);
    },
  });
}

function makeScratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

interface CliRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Lance `node dist/cli.js <args>` en sous-processus frais — jamais les sources TS. */
function runCli(args: string[], options: { cwd?: string } = {}): CliRun {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? tmpRepoDir,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Lit l'unique `result.json` écrit sous `<outDir>/<sujet assaini>/result.json` —
 * le nom exact du sous-dossier « sujet » n'a pas à être connu du test.
 */
function readSingleResultJson(outDir: string): { raw: string; parsed: unknown } {
  const subjectDirs = readdirSync(outDir);
  expect(subjectDirs).toHaveLength(1);
  const resultPath = join(outDir, subjectDirs[0] ?? "", "result.json");
  const raw = readFileSync(resultPath, "utf8");
  return { raw, parsed: JSON.parse(raw) as unknown };
}

/**
 * Retire récursivement toute clé dont le nom évoque un champ volatil
 * (date/heure/horodatage), pour comparer deux `result.json` "hors horodatage" —
 * générique afin de rester correct une fois qu'un vrai schéma horodaté arrive.
 */
function stripVolatileFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripVolatileFields);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/date|time|timestamp/i.test(key)) {
        continue;
      }
      out[key] = stripVolatileFields(entry);
    }
    return out;
  }
  return value;
}

beforeAll(() => {
  tmpRepoDir = mkdtempSync(join(tmpdir(), "recognaize-e2e-repo-"));
  scratchDirs.push(tmpRepoDir);
  copyRepoInto(tmpRepoDir);

  try {
    execFileSync("npm", ["ci", "--ignore-scripts"], {
      cwd: tmpRepoDir,
      encoding: "utf8",
      stdio: "pipe",
    });
    execFileSync("npm", ["run", "build"], {
      cwd: tmpRepoDir,
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message: string };
    throw new Error(
      `Échec de \`npm ci\`/\`npm run build\` sur le clone frais du jury :\n${err.stdout ?? ""}\n${err.stderr ?? err.message}`,
    );
  }

  cliPath = join(tmpRepoDir, "dist", "cli.js");

  // Profil mutilé : copie de bohort (déjà dans le clone temporaire) privée de
  // git-activity.json — construite dans le tmpdir, la fixture commitée n'est jamais
  // touchée.
  mutilatedBohortDir = makeScratchDir("recognaize-e2e-mutilated-bohort-");
  cpSync(join(tmpRepoDir, "fixtures", "profiles", "bohort"), mutilatedBohortDir, {
    recursive: true,
  });
  rmSync(join(mutilatedBohortDir, "git-activity.json"));

  emptyProfileDir = makeScratchDir("recognaize-e2e-empty-");
}, BUILD_HOOK_TIMEOUT_MS);

afterAll(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("chemin jury : node dist/cli.js sur un clone frais", () => {
  const standardProfiles = ["perceval", "bohort", "leodagan", "arthur"] as const;

  const cases: { label: string; dir: () => string; expectedExit: number }[] = [
    ...standardProfiles.map((name) => ({
      label: name,
      dir: () => join(tmpRepoDir, "fixtures", "profiles", name),
      expectedExit: 0,
    })),
    {
      label: "bohort mutilé (sans git-activity.json)",
      dir: () => mutilatedBohortDir,
      expectedExit: 0,
    },
    {
      label: "dossier vide",
      dir: () => emptyProfileDir,
      expectedExit: 2,
    },
    {
      label: "profil hostile (Part 3, phase 4 — fixtures/hostile)",
      dir: () => join(tmpRepoDir, "fixtures", "hostile"),
      expectedExit: 0,
    },
    // `venec`/`lancelot` : deux profils du même dépôt source
    // (ai-driven-dev/laivel-up) SANS rang documenté en amont ("non donné",
    // voir fixtures/profiles/ATTRIBUTION.md) — jamais dans `standardProfiles`
    // ni `evals/expected.json` (inventer un rang violerait la garantie
    // "jamais halluciner"). Robustesse seulement : la CLI ne doit jamais
    // planter sur un profil réellement inconnu, y compris très sparse
    // (`venec` : profile.json + session.md seulement).
    {
      label: "venec (profil aveugle, sparse)",
      dir: () => join(tmpRepoDir, "fixtures", "profiles", "venec"),
      expectedExit: 0,
    },
    {
      label: "lancelot (profil aveugle, complet)",
      dir: () => join(tmpRepoDir, "fixtures", "profiles", "lancelot"),
      expectedExit: 0,
    },
  ];

  test.for(cases)("$label -> exit $expectedExit, result.json JSON valide", ({ dir, expectedExit }) => {
    const outDir = makeScratchDir("recognaize-e2e-out-");
    const run = runCli(["analyze", dir(), "--out", outDir]);

    expect(run.status).toBe(expectedExit);

    const { parsed } = readSingleResultJson(outDir);
    expect(parsed).toBeTypeOf("object");
  });

  /**
   * Rang exact des 4 étalons, sur le clone frais du jury (mêmes garanties que
   * `npm run eval`, mais depuis la suite `vitest` standard — source de
   * vérité partagée : `evals/expected.json`, jamais un rang dupliqué en dur
   * ici).
   */
  test.for(standardProfiles)("%s : rang_affiche exact (evals/expected.json)", (name) => {
    const expected = JSON.parse(readFileSync(join(REPO_ROOT, "evals", "expected.json"), "utf8")) as {
      profiles: Record<string, { rang_affiche: string }>;
    };
    const wanted = expected.profiles[name]?.rang_affiche;
    expect(wanted, `evals/expected.json ne connaît pas le profil "${name}"`).toBeDefined();

    const outDir = makeScratchDir("recognaize-e2e-rank-");
    const run = runCli(["analyze", join(tmpRepoDir, "fixtures", "profiles", name), "--out", outDir]);
    expect(run.status).toBe(0);

    const { parsed } = readSingleResultJson(outDir);
    const doc = parsed as { rang_affiche: string | null };
    expect(doc.rang_affiche).toBe(wanted);
  });

  /**
   * `report.html` (`src/report/html.ts`) doit exister à côté de
   * `result.json` pour les 4 étalons, physiquement écrit, non vide, sans
   * ressource externe. Le contenu détaillé (titre honnête, cartes de marches,
   * miroir, badge qualité…) est couvert par `test/report.snapshot.test.ts`, pas
   * ici — ce test reste au niveau e2e (clone frais + binaire construit).
   */
  test.for(standardProfiles)("%s : report.html écrit à côté de result.json", (name) => {
    const outDir = makeScratchDir("recognaize-e2e-report-html-");
    const run = runCli(["analyze", join(tmpRepoDir, "fixtures", "profiles", name), "--out", outDir]);
    expect(run.status).toBe(0);

    const subjectDirs = readdirSync(outDir);
    expect(subjectDirs).toHaveLength(1);
    const reportPath = join(outDir, subjectDirs[0] ?? "", "report.html");
    const html = readFileSync(reportPath, "utf8");

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("<!doctype html>");
    expect(html).not.toMatch(/https?:\/\//);
  });

  /**
   * Même garantie que ci-dessus, pour `venec`/`lancelot` — deux profils sans
   * rang documenté (voir `cases` plus haut) : `report.html` doit s'écrire
   * sans planter même sur un profil réellement inconnu, jamais un
   * `undefined`/`null`/`NaN` visible — jamais une vérification de rang ici,
   * qui n'existe pas en amont.
   */
  test.for(["venec", "lancelot"] as const)("%s (profil aveugle) : report.html écrit, sans undefined/null/NaN", (name) => {
    const outDir = makeScratchDir("recognaize-e2e-report-html-blind-");
    const run = runCli(["analyze", join(tmpRepoDir, "fixtures", "profiles", name), "--out", outDir]);
    expect(run.status).toBe(0);

    const subjectDirs = readdirSync(outDir);
    expect(subjectDirs).toHaveLength(1);
    const reportPath = join(outDir, subjectDirs[0] ?? "", "report.html");
    const html = readFileSync(reportPath, "utf8");

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("<!doctype html>");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain("undefined");
    expect(html).not.toMatch(/>null</);
    expect(html).not.toContain("NaN");
  });

  /**
   * `--json | head -c 5` (lecteur fermant tôt le pipe, avant même la fin de
   * l'écriture) ne doit jamais faire planter la CLI
   * ni produire l'exit 1 réservé aux erreurs internes — `EPIPE` sur stdout est
   * ignoré (`process.stdout.on("error", …)`, `src/cli.ts`). `${PIPESTATUS[0]}`
   * (bashisme, assumé — plateformes cibles Linux/macOS, spec « Lancement ») ⇒
   * exit code du PREMIER maillon du pipe (`node dist/cli.js`), pas celui de
   * `head`.
   */
  test("analyze --json | head -c 5 : EPIPE ignoré, exit du premier maillon du pipe = 0", () => {
    const arthurDir = join(tmpRepoDir, "fixtures", "profiles", "arthur");
    const outDir = makeScratchDir("recognaize-e2e-epipe-");
    const script = `${JSON.stringify(process.execPath)} ${JSON.stringify(cliPath)} analyze ${JSON.stringify(arthurDir)} --out ${JSON.stringify(outDir)} --json | head -c 5; echo "EXITCODE:\${PIPESTATUS[0]}"`;

    const result = spawnSync("bash", ["-c", script], { cwd: tmpRepoDir, encoding: "utf8" });
    if (result.error) throw result.error;

    // `head -c 5` n'émet pas de retour à la ligne final : EXITCODE peut suivre
    // directement les 5 octets lus, sur la même ligne — recherche par motif,
    // jamais par ligne complète.
    const match = /EXITCODE:(\d+)/.exec(result.stdout);
    expect(match, `sortie inattendue : ${result.stdout}`).not.toBeNull();
    expect(match?.[1]).toBe("0");
  });

  test("analyze --json : stdout ne contient que le JSON du résultat (une ligne)", () => {
    const outDir = makeScratchDir("recognaize-e2e-json-only-");
    const perceval = join(tmpRepoDir, "fixtures", "profiles", "perceval");
    const run = runCli(["analyze", perceval, "--out", outDir, "--json"]);

    expect(run.status).toBe(0);
    const lines = run.stdout.split("\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "") as { schema_version: string };
    expect(parsed.schema_version).toBe("0.5.0-part5-result-json");

    // `--json` ⇒ pas d'écriture de report.html.
    const subjectDirs = readdirSync(outDir);
    expect(subjectDirs).toHaveLength(1);
    expect(existsSync(join(outDir, subjectDirs[0] ?? "", "report.html"))).toBe(false);
  });

  test("deux exécutions consécutives du même profil donnent des result.json identiques hors horodatage", () => {
    const outDirFirstRun = makeScratchDir("recognaize-e2e-repeat-1-");
    const outDirSecondRun = makeScratchDir("recognaize-e2e-repeat-2-");
    const bohortDir = join(tmpRepoDir, "fixtures", "profiles", "bohort");

    const firstRun = runCli(["analyze", bohortDir, "--out", outDirFirstRun]);
    const secondRun = runCli(["analyze", bohortDir, "--out", outDirSecondRun]);

    expect(firstRun.status).toBe(0);
    expect(secondRun.status).toBe(0);

    const first = readSingleResultJson(outDirFirstRun);
    const second = readSingleResultJson(outDirSecondRun);

    expect(stripVolatileFields(first.parsed)).toEqual(stripVolatileFields(second.parsed));
  });

  /**
   * Test « profil hostile » de bout en bout : la CLI ne plante jamais sur un
   * dossier hostile (symlink sortant, fichier de 3 Mo, BOM/CRLF, emoji dans
   * `profile_id`, champs mal typés dans plusieurs pièces, `available`
   * incohérent, `repo-context/node_modules/` recopié) et produit un
   * `result.json` réel (schéma `ANALYSIS_SCHEMA_VERSION`, verdicts, rang,
   * avertissements structurés issus des adaptateurs). Seule la FORME du
   * document et la présence réelle d'avertissements sont vérifiées ici — pas
   * les valeurs de rang/fourchette exactes.
   */
  test("profil hostile : exit 0, result.json réel (schéma Part 4) avec avertissements structurés surfacés", () => {
    const outDir = makeScratchDir("recognaize-e2e-hostile-out-");
    const hostileDir = join(tmpRepoDir, "fixtures", "hostile");

    const run = runCli(["analyze", hostileDir, "--out", outDir]);

    expect(run.status).toBe(0);

    const { parsed } = readSingleResultJson(outDir);
    const doc = parsed as {
      schema_version: string;
      status: string;
      warnings: readonly string[];
    };
    expect(doc.schema_version).toBe("0.5.0-part5-result-json");
    expect(["ok", "indeterminate"]).toContain(doc.status);
    expect(Array.isArray(doc.warnings)).toBe(true);
    // Le profil hostile porte volontairement plusieurs champs mal typés
    // (ai_coauthored_ratio en chaîne, pull_requests.total négatif, mesures
    // Sonar hors bornes…) — au moins un avertissement structuré doit les nommer.
    expect(doc.warnings.length).toBeGreaterThan(0);
    expect(doc.warnings.some((warning) => warning.includes("git-activity.json"))).toBe(true);
  });

  test("s'exécute correctement depuis un cwd arbitraire (résolution via import.meta.url)", () => {
    const outDir = makeScratchDir("recognaize-e2e-arbitrary-cwd-");
    const arthurDir = join(tmpRepoDir, "fixtures", "profiles", "arthur");
    const arbitraryCwd = tmpdir();

    expect(arbitraryCwd).not.toBe(tmpRepoDir);

    const run = runCli(["analyze", arthurDir, "--out", outDir], { cwd: arbitraryCwd });

    expect(run.status).toBe(0);
    const { parsed } = readSingleResultJson(outDir);
    expect(parsed).toBeTypeOf("object");
  });
});
