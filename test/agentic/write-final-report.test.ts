/**
 * Test de scripts/agentic/write-final-report.ts — la dernière étape du chemin
 * agentique (action 04 du skill), qui écrit recognaize-out-final/<profile_id>/ à partir
 * du verdict agentique déjà jugé (judge-from-signals.ts, testé séparément) et
 * des métadonnées d'exécution fournies par l'orchestrateur. Ne teste PAS
 * l'estimation de tokens elle-même (calculée par le skill, pas ce script) —
 * seulement que ce script assemble et écrit correctement ce qu'on lui donne.
 */
import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const scriptPath = join(repoRoot, "scripts", "agentic", "write-final-report.ts");

const FAKE_DETERMINISTIC_RESULT = {
  profile_id: "bohort-c5ac0a90",
  rang_affiche: "blue",
  fourchette: { bas: "blue", haut: "blue" },
  confiance_globale: 0.32,
  axes: [
    { axe: "T", confiance: 0.36 },
    { axe: "H", confiance: 0.36 },
    { axe: "I", confiance: 0.32 },
    { axe: "P", confiance: 0.5 },
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
        confiance_globale: 0.24,
        axes: [
          { axe: "T", confiance: 0.28 },
          { axe: "H", confiance: 0.43 },
          { axe: "I", confiance: 0.24 },
          { axe: "P", confiance: 0.34 },
        ],
        ownership: {},
        verdicts: [],
        incoherences: ["T2 : sources en désaccord (PR, GA, S).", "H7 : sources en désaccord (RC, S)."],
        warnings: [],
        status: "ok",
      },
      evidence_count: 4,
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

describe("scripts/agentic/write-final-report.ts", () => {
  it("écrit verdict.json, meta.json, report.md dans out_dir/<profile_id>", () => {
    const payload = basePayload();
    const { out_dir } = run(payload);
    expect(out_dir).toContain("bohort-c5ac0a90");

    const verdict = JSON.parse(readFileSync(join(out_dir, "verdict.json"), "utf8"));
    expect(verdict.profile_id).toBe("bohort-c5ac0a90");
    expect(verdict.agentic.rang_affiche).toBe("blue");
    expect(verdict.comparison.rows).toHaveLength(1);

    const meta = JSON.parse(readFileSync(join(out_dir, "meta.json"), "utf8"));
    expect(meta.model).toBe("claude-sonnet-5");
    expect(meta.token_estimate.estimated_tokens).toBe(300);
    expect(meta.cost_estimate.usd).toBe(0.001);

    const reportMd = readFileSync(join(out_dir, "report.md"), "utf8");
    expect(reportMd).toContain("bohort-c5ac0a90");
    expect(reportMd).toContain("claude-sonnet-5");
    expect(reportMd).toContain("blue");
    expect(reportMd).not.toMatch(/undefined|NaN/);
  });

  it("le rapport signale explicitement chaque désaccord, jamais silencieux", () => {
    const payload = basePayload({
      comparison: {
        rows: [{ axe: "T", deterministic: "T2", agentic: "T1", match: false }],
        mismatch_notes: ["T : l'extracteur agentique n'a pas trouvé PR.median_files_changed."],
      },
    });
    const { out_dir } = run(payload);
    const reportMd = readFileSync(join(out_dir, "report.md"), "utf8");
    expect(reportMd).toContain("**non**");
    expect(reportMd).toContain("l'extracteur agentique n'a pas trouvé");
  });

  it("aucun désaccord -> le rapport le dit explicitement, jamais une section vide", () => {
    const payload = basePayload();
    const { out_dir } = run(payload);
    const reportMd = readFileSync(join(out_dir, "report.md"), "utf8");
    expect(reportMd).toContain("Aucun désaccord");
  });

  it("la confiance par axe explique l'écart de confiance globale, axe par axe (AC, 2026-08-31)", () => {
    const payload = basePayload();
    const { out_dir } = run(payload);
    const reportMd = readFileSync(join(out_dir, "report.md"), "utf8");
    expect(reportMd).toContain("## Confiance par axe");
    // T : 0.36 -> 0.28, écart -0.08
    expect(reportMd).toMatch(/\| T \| 0\.36 \| 0\.28 \| -0\.08 \|/);
    // H : 0.36 -> 0.43, écart +0.07
    expect(reportMd).toMatch(/\| H \| 0\.36 \| 0\.43 \| \+0\.07 \|/);
    expect(reportMd).not.toMatch(/undefined|NaN/);
  });

  it("la comparaison des incohérences sépare communes / déterministe seul / agentique seul (AC, 2026-08-31)", () => {
    const payload = basePayload();
    const { out_dir } = run(payload);
    const reportMd = readFileSync(join(out_dir, "report.md"), "utf8");
    expect(reportMd).toContain("## Incohérences entre sources — comparaison");
    expect(reportMd).toMatch(/Communes aux deux chemins \(1\)/);
    expect(reportMd).toContain("T2 : sources en désaccord (PR, GA, S).");
    expect(reportMd).toMatch(/Seulement côté déterministe \(1\)/);
    expect(reportMd).toContain("H6 : sources en désaccord (RC, S).");
    expect(reportMd).toMatch(/Seulement côté agentique \(1\)/);
    expect(reportMd).toContain("H7 : sources en désaccord (RC, S).");
  });

  it("aucune incohérence des deux côtés -> le dit explicitement, jamais une section vide (AC, 2026-08-31)", () => {
    const payload = basePayload({
      agentic: {
        result: { rang_affiche: "blue", confiance_globale: 0.3, axes: [{ axe: "T", confiance: 0.3 }], ownership: {}, verdicts: [], incoherences: [], warnings: [], status: "ok" },
        evidence_count: 4,
      },
      deterministic_result_path: (() => {
        const workDir = makeTmpDir("recognaize-final-report-no-incoherence-");
        const detPath = join(workDir, "result.json");
        writeFileSync(detPath, JSON.stringify({ ...FAKE_DETERMINISTIC_RESULT, incoherences: [] }));
        return detPath;
      })(),
    });
    const { out_dir } = run(payload);
    const reportMd = readFileSync(join(out_dir, "report.md"), "utf8");
    expect(reportMd).toContain("Aucune incohérence entre sources détectée par aucun des deux chemins");
  });

  it("même input (generated_at fixe compris) -> deux exécutions écrivent des fichiers strictement identiques (AC, 2026-08-31)", () => {
    const payload = basePayload();
    const { out_dir: outDirA } = run(payload);
    const verdictA = readFileSync(join(outDirA, "verdict.json"), "utf8");
    const metaA = readFileSync(join(outDirA, "meta.json"), "utf8");
    const reportA = readFileSync(join(outDirA, "report.md"), "utf8");

    const { out_dir: outDirB } = run(payload);
    const verdictB = readFileSync(join(outDirB, "verdict.json"), "utf8");
    const metaB = readFileSync(join(outDirB, "meta.json"), "utf8");
    const reportB = readFileSync(join(outDirB, "report.md"), "utf8");

    expect(outDirB).toBe(outDirA);
    expect(verdictB).toBe(verdictA);
    expect(metaB).toBe(metaA);
    expect(reportB).toBe(reportA);
  });

  it("sans generated_at (horloge murale réelle) -> seul generated_at diffère, le reste est identique", () => {
    const payload = basePayload();
    delete (payload as { generated_at?: string }).generated_at;

    const { out_dir: outDirA } = run(payload);
    const verdictA = JSON.parse(readFileSync(join(outDirA, "verdict.json"), "utf8"));

    const { out_dir: outDirB } = run(payload);
    const verdictB = JSON.parse(readFileSync(join(outDirB, "verdict.json"), "utf8"));

    delete verdictA.generated_at;
    delete verdictB.generated_at;
    expect(verdictB).toEqual(verdictA);
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
