/**
 * Test de scripts/agentic/write-final-report.ts — la dernière étape du chemin
 * agentique (action 04 du skill), qui écrit recognaize-out-final/<profile_id>/ à partir
 * du verdict agentique déjà jugé (judge-from-signals.ts, testé séparément) et
 * des métadonnées d'exécution fournies par l'orchestrateur. Ne teste PAS
 * l'estimation de tokens elle-même (calculée par le skill, pas ce script) —
 * seulement que ce script assemble et écrit correctement ce qu'on lui donne.
 *
 * Depuis la parité report.html (aidd_docs/tasks/2026_08/2026_08_31_agentic-report-html-parity/) :
 * ce script n'écrit plus de `report.md` fait main — il écrit `report-input.json`
 * (format `ExportInput`, `src/report/export-input.ts`), destiné à
 * `node dist/cli.js export`. Le dernier test de ce fichier enchaîne
 * réellement les deux étapes pour vérifier qu'elles restent compatibles.
 */
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const scriptPath = join(repoRoot, "scripts", "agentic", "write-final-report.ts");
const CLI_PATH = join(repoRoot, "dist", "cli.js");

const FAKE_DETERMINISTIC_RESULT = {
  profile_id: "bohort-c5ac0a90",
  as_of: "2026-07-15",
  rang_affiche: "blue",
  fourchette: { bas: "blue", haut: "blue" },
  confiance_globale: 0.32,
  axes: [
    { axe: "T", niveau_prouve: "T2", confiance: 0.36 },
    { axe: "H", niveau_prouve: "H3", confiance: 0.36 },
    { axe: "I", niveau_prouve: "I2", confiance: 0.32 },
    { axe: "P", niveau_prouve: "P3", confiance: 0.5 },
  ],
  incoherences: ["T2 : sources en désaccord (PR, GA, S).", "H6 : sources en désaccord (RC, S)."],
};

const createdDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function basePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const workDir = makeTmpDir("recognaize-final-report-test-");
  const detPath = join(workDir, "result.json");
  writeFileSync(detPath, JSON.stringify(FAKE_DETERMINISTIC_RESULT));
  const outDir = join(workDir, "recognaize-out-final");

  return {
    deterministic_result_path: detPath,
    agentic: {
      result: {
        rang_affiche: "blue",
        rang_prouve: "blue",
        rang_ponctuel: "blue",
        confiance_globale: 0.24,
        fourchette: { bas: "blue", haut: "blue" },
        axes: [
          { axe: "T", niveau_prouve: "T2", niveau_ponctuel: "T2", plafond_potentiel: "T2", etats: [], couverture: 0.5, accord: 0.5, confiance: 0.28, observe: true },
          { axe: "H", niveau_prouve: "H3", niveau_ponctuel: "H3", plafond_potentiel: "H3", etats: [], couverture: 0.5, accord: 0.5, confiance: 0.43, observe: true },
          { axe: "I", niveau_prouve: "I2", niveau_ponctuel: "I2", plafond_potentiel: "I2", etats: [], couverture: 0.5, accord: 0.5, confiance: 0.24, observe: true },
          { axe: "P", niveau_prouve: "P3", niveau_ponctuel: "P3", plafond_potentiel: "P3", etats: [], couverture: 0.5, accord: 0.5, confiance: 0.34, observe: true },
        ],
        ownership: { niveau_prouve: "O3", niveau_ponctuel: "O3", etats: [], rabais_applique: false },
        verdicts: [],
        incoherences: ["T2 : sources en désaccord (PR, GA, S).", "H7 : sources en désaccord (RC, S)."],
        warnings: [],
        status: "ok",
      },
      evidence_count: 0,
      evidence: [],
    },
    comparison: {
      rows: [{ axe: "T", deterministic: "T2", agentic: "T2", match: true }],
      mismatch_notes: [],
    },
    model: "claude-sonnet-5",
    token_estimate: { prompt_chars: 1000, output_chars: 200, estimated_tokens: 300, note: "estimation grossière, pas une mesure." },
    cost_estimate: { usd: 0.001, note: "approximatif." },
    profile_dir: join(workDir, "profile-dir-not-used-here"),
    out_dir: outDir,
    generated_at: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

function run(payload: Record<string, unknown>): { out_dir: string } {
  const out = execFileSync("npx", ["tsx", scriptPath], {
    cwd: repoRoot,
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  return JSON.parse(out);
}

interface ReportInput {
  readonly document: Record<string, unknown>;
  readonly agentic_context: {
    readonly deterministic: Record<string, unknown>;
    readonly comparison: { readonly rows: readonly unknown[]; readonly mismatch_notes: readonly string[] };
    readonly execution: Record<string, unknown>;
  };
}

function readReportInput(outDir: string): ReportInput {
  return JSON.parse(readFileSync(join(outDir, "report-input.json"), "utf8")) as ReportInput;
}

describe("scripts/agentic/write-final-report.ts", () => {
  it("écrit verdict.json, meta.json, report-input.json dans out_dir/<profile_id> — jamais report.md", () => {
    const payload = basePayload();
    const { out_dir } = run(payload);
    expect(out_dir).toContain("bohort-c5ac0a90");

    expect(readdirSync(out_dir).sort()).toEqual(["meta.json", "report-input.json", "verdict.json"]);

    const verdict = JSON.parse(readFileSync(join(out_dir, "verdict.json"), "utf8"));
    expect(verdict.profile_id).toBe("bohort-c5ac0a90");
    expect(verdict.agentic.rang_affiche).toBe("blue");
    expect(verdict.comparison.rows).toHaveLength(1);

    const meta = JSON.parse(readFileSync(join(out_dir, "meta.json"), "utf8"));
    expect(meta.model).toBe("claude-sonnet-5");
    expect(meta.token_estimate.estimated_tokens).toBe(300);
    expect(meta.cost_estimate.usd).toBe(0.001);

    const reportInput = readReportInput(out_dir);
    expect(reportInput.document.profile_id).toBe("bohort-c5ac0a90");
    expect(reportInput.document.as_of).toBe("2026-07-15");
    expect(reportInput.document.rang_affiche).toBe("blue");
    expect(JSON.stringify(reportInput)).not.toMatch(/undefined|NaN/);
  });

  it("document reprend profile_id/as_of du déterministe, jamais recalculés — le reste vient du verdict agentique tel quel", () => {
    const payload = basePayload();
    const { out_dir } = run(payload);
    const { document } = readReportInput(out_dir);
    expect(document.profile_id).toBe(FAKE_DETERMINISTIC_RESULT.profile_id);
    expect(document.as_of).toBe(FAKE_DETERMINISTIC_RESULT.as_of);
    // confiance_globale/axes viennent du verdict AGENTIQUE (0.24), pas du déterministe (0.32).
    expect(document.confiance_globale).toBe(0.24);
  });

  it("le rapport signale explicitement chaque désaccord, jamais silencieux", () => {
    const payload = basePayload({
      comparison: {
        rows: [{ axe: "T", deterministic: "T2", agentic: "T1", match: false }],
        mismatch_notes: ["T : l'extracteur agentique n'a pas trouvé PR.median_files_changed."],
      },
    });
    const { out_dir } = run(payload);
    const { agentic_context } = readReportInput(out_dir);
    expect(agentic_context.comparison.rows).toEqual([{ axe: "T", deterministic: "T2", agentic: "T1", match: false }]);
    expect(agentic_context.comparison.mismatch_notes).toContain("T : l'extracteur agentique n'a pas trouvé PR.median_files_changed.");
  });

  it("aucun désaccord -> comparison.mismatch_notes reste vide, jamais un texte inventé", () => {
    const payload = basePayload();
    const { out_dir } = run(payload);
    const { agentic_context } = readReportInput(out_dir);
    expect(agentic_context.comparison.mismatch_notes).toEqual([]);
  });

  it("agentic_context.deterministic porte les axes/incohérences du CLI déterministe tels quels (pour le delta/diff calculés par report/html.ts)", () => {
    const payload = basePayload();
    const { out_dir } = run(payload);
    const { agentic_context } = readReportInput(out_dir);
    expect(agentic_context.deterministic["rang_affiche"]).toBe("blue");
    expect(agentic_context.deterministic["axes"]).toEqual(FAKE_DETERMINISTIC_RESULT.axes);
    expect(agentic_context.deterministic["incoherences"]).toEqual(FAKE_DETERMINISTIC_RESULT.incoherences);
  });

  it("execution porte modèle/tokens/coût transcrits tels quels, avec leurs notes d'estimation", () => {
    const payload = basePayload();
    const { out_dir } = run(payload);
    const { agentic_context } = readReportInput(out_dir);
    expect(agentic_context.execution["model"]).toBe("claude-sonnet-5");
    expect((agentic_context.execution["token_estimate"] as { note: string }).note).toContain("estimation grossière");
    expect((agentic_context.execution["cost_estimate"] as { note: string }).note).toContain("approximatif");
  });

  it("même input (generated_at fixe compris) -> deux exécutions écrivent des fichiers strictement identiques (AC, 2026-08-31)", () => {
    const payload = basePayload();
    const { out_dir: outDirA } = run(payload);
    const verdictA = readFileSync(join(outDirA, "verdict.json"), "utf8");
    const metaA = readFileSync(join(outDirA, "meta.json"), "utf8");
    const reportInputA = readFileSync(join(outDirA, "report-input.json"), "utf8");

    const { out_dir: outDirB } = run(payload);
    const verdictB = readFileSync(join(outDirB, "verdict.json"), "utf8");
    const metaB = readFileSync(join(outDirB, "meta.json"), "utf8");
    const reportInputB = readFileSync(join(outDirB, "report-input.json"), "utf8");

    expect(outDirB).toBe(outDirA);
    expect(verdictB).toBe(verdictA);
    expect(metaB).toBe(metaA);
    expect(reportInputB).toBe(reportInputA);
  });

  it("sans generated_at (horloge murale réelle) -> seul generated_at diffère, le reste est identique", () => {
    const payload = basePayload();
    delete (payload as { generated_at?: string }).generated_at;

    const { out_dir: outDirA } = run(payload);
    const verdictA = JSON.parse(readFileSync(join(outDirA, "verdict.json"), "utf8"));
    const reportInputA = readReportInput(outDirA);

    const { out_dir: outDirB } = run(payload);
    const verdictB = JSON.parse(readFileSync(join(outDirB, "verdict.json"), "utf8"));
    const reportInputB = readReportInput(outDirB);

    delete verdictA.generated_at;
    delete verdictB.generated_at;
    expect(verdictB).toEqual(verdictA);

    const executionA = { ...reportInputA.agentic_context.execution };
    const executionB = { ...reportInputB.agentic_context.execution };
    delete (executionA as { generated_at?: string }).generated_at;
    delete (executionB as { generated_at?: string }).generated_at;
    expect(executionB).toEqual(executionA);
  });

  it("out_dir ne duplique jamais recognaize-cli-out/ — même profile_id, dossier racine différent", () => {
    const payload = basePayload();
    const { out_dir } = run(payload);
    expect(out_dir).not.toContain("recognaize-cli-out");
    expect(out_dir).toContain("recognaize-out-final");
  });

  it("refuse d'écrire à l'intérieur du dossier de profil analysé (même garde-fou que le CLI)", () => {
    const workDir = makeTmpDir("recognaize-final-report-guard-");
    const detPath = join(workDir, "result.json");
    writeFileSync(detPath, JSON.stringify(FAKE_DETERMINISTIC_RESULT));
    const profileDir = join(workDir, "the-profile");
    mkdirSync(profileDir, { recursive: true });

    const payload = basePayload({
      deterministic_result_path: detPath,
      profile_dir: profileDir,
      out_dir: join(profileDir, "recognaize-out-final"), // à l'intérieur du dossier analysé -> doit être refusé
    });

    expect(() => run(payload)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Chaîne réelle write-final-report.ts -> node dist/cli.js export : les deux
// scripts doivent rester compatibles au fil du temps, pas seulement au niveau
// du schéma testé isolément (test/report.export-input.test.ts).
// ---------------------------------------------------------------------------

describe("write-final-report.ts -> node dist/cli.js export : chaîne réelle (AC, phase 2)", () => {
  beforeAll(() => {
    if (!existsSync(CLI_PATH)) {
      throw new Error(`"${CLI_PATH}" introuvable — lancer \`npm run build\` avant ce test.`);
    }
  });

  it("report-input.json produit par write-final-report.ts est un --in valide pour l'export CLI, qui rend le bandeau et la comparaison", () => {
    const payload = basePayload();
    const { out_dir } = run(payload);

    const exportOutDir = makeTmpDir("recognaize-final-report-export-out-");
    const exportRun = execFileSync(
      process.execPath,
      [CLI_PATH, "export", "--in", resolve(out_dir, "report-input.json"), "--out", exportOutDir],
      { encoding: "utf8" },
    );
    void exportRun;

    const subjectDirs = readdirSync(exportOutDir);
    expect(subjectDirs).toHaveLength(1);
    const html = readFileSync(join(exportOutDir, subjectDirs[0] ?? "", "report.html"), "utf8");
    expect(html).toContain("Verdict AGENTIQUE");
    expect(html).toContain("Comparaison au chemin déterministe");
    expect(html).not.toMatch(/undefined|NaN/);
  });
});
