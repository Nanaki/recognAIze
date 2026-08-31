/**
 * `export --in <fichier> --out <dir> [--profile-dir <dir>]` (binaire construit,
 * `dist/cli.js`, jamais les sources TS — même précédent que
 * `test/cli.checks-explain.test.ts`) : rend `report.html` à partir de
 * données déjà jugées, sans réanalyse.
 *
 * L'entrée `--in` de ces tests est construite à partir d'un VRAI
 * `result.json` (`node dist/cli.js analyze fixtures/profiles/bohort --json`)
 * — jamais un document synthétique inventé à la main : les champs
 * administratifs superflus (`schema_version`/`tool_version`/…) sont
 * silencieusement ignorés par `ExportInputSchema` (non strict), donc le
 * `result.json` complet est un `{document: ...}` valide tel quel.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

const TEST_FILE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "..");
const CLI_PATH = join(REPO_ROOT, "dist", "cli.js");
const BOHORT_DIR = join(REPO_ROOT, "fixtures", "profiles", "bohort");

interface CliRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(args: string[]): CliRun {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const scratchDirs: string[] = [];
function makeScratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

let bohortDocument: Record<string, unknown>;
let validInputPath: string;

beforeAll(() => {
  if (!existsSync(CLI_PATH)) {
    throw new Error(`"${CLI_PATH}" introuvable — lancer \`npm run build\` avant \`vitest run test/cli.export.test.ts\`.`);
  }

  const analyzeOut = makeScratchDir("recognaize-export-fixture-");
  const analyzeRun = runCli(["analyze", BOHORT_DIR, "--out", analyzeOut, "--json"]);
  if (analyzeRun.status !== 0) {
    throw new Error(`analyze --json a échoué en préparation de fixture : ${analyzeRun.stderr}`);
  }
  bohortDocument = JSON.parse(analyzeRun.stdout) as Record<string, unknown>;

  const inputDir = makeScratchDir("recognaize-export-input-");
  validInputPath = join(inputDir, "export-input.json");
  writeFileSync(validInputPath, JSON.stringify({ document: bohortDocument }), "utf8");
});

afterAll(() => {
  for (const dir of scratchDirs) {
    execFileSync("rm", ["-rf", dir]);
  }
});

function readReportHtml(outDir: string): string {
  const subjectDirs = readdirSync(outDir);
  expect(subjectDirs).toHaveLength(1);
  return readFileSync(join(outDir, subjectDirs[0] ?? "", "report.html"), "utf8");
}

describe("export --in <valide> --out <dir> : rend report.html sans réanalyse", () => {
  test("exit 0, report.html écrit, contenu du chemin déterministe (aucun bandeau agentique)", () => {
    const outDir = makeScratchDir("recognaize-export-out-");
    const run = runCli(["export", "--in", validInputPath, "--out", outDir]);
    expect(run.status, run.stderr).toBe(0);

    const subjectDirs = readdirSync(outDir);
    expect(subjectDirs).toHaveLength(1);
    // `export` n'écrit QUE report.html — jamais result.json, jamais l'historique
    // de runs (ce ne sont pas des sorties de ce mode, voir docstring de `runExport`).
    expect(readdirSync(join(outDir, subjectDirs[0] ?? ""))).toEqual(["report.html"]);

    const html = readReportHtml(outDir);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain(String(bohortDocument["rang_affiche"]));
    expect(html).not.toContain('<div class="agentic-banner"');
    expect(html).not.toContain("Verdict AGENTIQUE");
  });

  // Régression (trouvée en vérification bout-en-bout, 2026-08-31) :
  // `sanitizeSubject` n'est PAS idempotente (le hash dépend de la chaîne
  // reçue) — `export` doit utiliser `document.profile_id` TEL QUEL comme nom
  // de dossier, jamais le réassainir, sous peine d'écrire dans un second
  // dossier différent de celui du run déterministe du même profil.
  test("le dossier de sortie est EXACTEMENT <out>/<profile_id> — jamais un profile_id réassaini (régression)", () => {
    const outDir = makeScratchDir("recognaize-export-exact-dir-");
    const run = runCli(["export", "--in", validInputPath, "--out", outDir]);
    expect(run.status, run.stderr).toBe(0);

    const subjectDirs = readdirSync(outDir);
    expect(subjectDirs).toEqual([String(bohortDocument["profile_id"])]);
  });

  test("--profile-dir dérive git-activity.json/sonar-measures.json, mais ne lit JAMAIS declaratif.md (DEC-004)", () => {
    const outDir = makeScratchDir("recognaize-export-profile-dir-");
    const run = runCli(["export", "--in", validInputPath, "--out", outDir, "--profile-dir", BOHORT_DIR]);
    expect(run.status, run.stderr).toBe(0);

    const html = readReportHtml(outDir);
    // bohort a pourtant un declaratif.md réel avec du contenu exploitable —
    // s'il apparaissait ici, ce serait la preuve d'une fuite DEC-004.
    expect(html).toContain("Aucun déclaratif disponible pour ce profil");
    expect(html).toContain("Qualité du code");
  });

  test("agentic_context présent ⇒ bandeau et comparaison rendus", () => {
    const withAgenticContext = {
      document: bohortDocument,
      agentic_context: {
        deterministic: {
          rang_affiche: bohortDocument["rang_affiche"],
          fourchette: bohortDocument["fourchette"],
          confiance_globale: bohortDocument["confiance_globale"],
          axes: (bohortDocument["axes"] as { axe: string; niveau_prouve: string | null; confiance: number }[]).map((a) => ({
            axe: a.axe,
            niveau_prouve: a.niveau_prouve,
            confiance: a.confiance,
          })),
          incoherences: bohortDocument["incoherences"],
        },
        comparison: { rows: [{ axe: "T", deterministic: "T2", agentic: "T2", match: true }], mismatch_notes: [] },
        execution: {
          model: "claude-sonnet-5",
          token_estimate: { prompt_chars: 29030, output_chars: 20385, estimated_tokens: 12354, note: "estimation." },
          cost_estimate: { usd: 0.0655, note: "approximatif." },
          generated_at: "2026-08-31T01:26:41.016Z",
        },
      },
    };
    const inputDir = makeScratchDir("recognaize-export-with-context-");
    const inputPath = join(inputDir, "export-input.json");
    writeFileSync(inputPath, JSON.stringify(withAgenticContext), "utf8");

    const outDir = makeScratchDir("recognaize-export-with-context-out-");
    const run = runCli(["export", "--in", inputPath, "--out", outDir]);
    expect(run.status, run.stderr).toBe(0);

    const html = readReportHtml(outDir);
    expect(html).toContain('<div class="agentic-banner"');
    expect(html).toContain("Verdict AGENTIQUE");
    expect(html).toContain("Comparaison au chemin déterministe");
  });

  test("déterminisme : même --in exporté deux fois ⇒ report.html strictement identique", () => {
    const outDir1 = makeScratchDir("recognaize-export-det-1-");
    const outDir2 = makeScratchDir("recognaize-export-det-2-");
    const run1 = runCli(["export", "--in", validInputPath, "--out", outDir1]);
    const run2 = runCli(["export", "--in", validInputPath, "--out", outDir2]);
    expect(run1.status).toBe(0);
    expect(run2.status).toBe(0);

    expect(readReportHtml(outDir1)).toBe(readReportHtml(outDir2));
  });
});

describe("export : entrée invalide ⇒ exit 3, jamais exit 1", () => {
  test("--in inexistant ⇒ exit 3", () => {
    const outDir = makeScratchDir("recognaize-export-missing-in-");
    const run = runCli(["export", "--in", "/chemin/totalement/inexistant-xyz.json", "--out", outDir]);
    expect(run.status).toBe(3);
  });

  test("--in JSON invalide (pas du JSON) ⇒ exit 3", () => {
    const inputDir = makeScratchDir("recognaize-export-bad-json-");
    const inputPath = join(inputDir, "export-input.json");
    writeFileSync(inputPath, "{ ceci n'est pas du JSON", "utf8");
    const outDir = makeScratchDir("recognaize-export-bad-json-out-");
    const run = runCli(["export", "--in", inputPath, "--out", outDir]);
    expect(run.status).toBe(3);
  });

  test("--in valide comme JSON mais champ jugé obligatoire absent ⇒ exit 3, message nommant le champ", () => {
    const { fourchette, ...withoutFourchette } = bohortDocument;
    void fourchette;
    const inputDir = makeScratchDir("recognaize-export-missing-field-");
    const inputPath = join(inputDir, "export-input.json");
    writeFileSync(inputPath, JSON.stringify({ document: withoutFourchette }), "utf8");
    const outDir = makeScratchDir("recognaize-export-missing-field-out-");
    const run = runCli(["export", "--in", inputPath, "--out", outDir]);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain("fourchette");
  });

  test("--in manquant (option obligatoire) ⇒ exit 3", () => {
    const outDir = makeScratchDir("recognaize-export-no-in-flag-");
    const run = runCli(["export", "--out", outDir]);
    expect(run.status).toBe(3);
  });
});

describe("export : garde-fou dossier de profil (même contrat que analyze)", () => {
  test("--out à l'intérieur de --profile-dir ⇒ refus, rien écrit dans le profil", () => {
    const run = runCli(["export", "--in", validInputPath, "--out", join(BOHORT_DIR, "should-not-exist"), "--profile-dir", BOHORT_DIR]);
    expect(run.status).toBe(3);
    expect(existsSync(join(BOHORT_DIR, "should-not-exist"))).toBe(false);
  });

  test("--profile-dir inexistant ⇒ exit 3", () => {
    const outDir = makeScratchDir("recognaize-export-bad-profile-dir-");
    const run = runCli(["export", "--in", validInputPath, "--out", outDir, "--profile-dir", "/chemin/totalement/inexistant-xyz"]);
    expect(run.status).toBe(3);
  });
});
