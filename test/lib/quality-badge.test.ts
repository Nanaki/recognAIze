import { execSync } from "node:child_process";
import { describe, expect, test } from "vitest";

import { computeQualityBadge } from "../../src/lib/quality-badge.js";
import type { GitActivityData } from "../../src/sources/git-activity.js";
import type { SonarData } from "../../src/sources/sonar.js";

const REPO_ROOT = process.cwd();

function ga(overrides: Partial<GitActivityData> = {}): GitActivityData {
  return { ...overrides };
}

function sonar(overrides: Partial<SonarData["measures"]> = {}): SonarData {
  return { measures: { ...overrides } };
}

describe("computeQualityBadge", () => {
  test("aucune donnée disponible ⇒ non_evalue", () => {
    expect(computeQualityBadge(undefined, undefined)).toBe("non_evalue");
    expect(computeQualityBadge(sonar({}), ga({}))).toBe("non_evalue");
  });

  test("les 4 critères disponibles et tous au vert ⇒ vert", () => {
    const badge = computeQualityBadge(
      sonar({ bugs: 0, duplicated_lines_density: 0.05 }),
      ga({ tests: { coverage_start: 0.8, coverage_end: 0.8 }, ci: { failure_rate: 0.1 } }),
    );
    expect(badge).toBe("vert");
  });

  test("couverture stable exactement à la tolérance (-0,02) ⇒ toujours vert", () => {
    const badge = computeQualityBadge(
      sonar({ bugs: 0, duplicated_lines_density: 0.05 }),
      ga({ tests: { coverage_start: 0.8, coverage_end: 0.78 }, ci: { failure_rate: 0.1 } }),
    );
    expect(badge).toBe("vert");
  });

  test("exactement 1 critère disponible en échec (bugs > 0) ⇒ orange", () => {
    const badge = computeQualityBadge(
      sonar({ bugs: 3, duplicated_lines_density: 0.05 }),
      ga({ tests: { coverage_start: 0.8, coverage_end: 0.8 }, ci: { failure_rate: 0.1 } }),
    );
    expect(badge).toBe("orange");
  });

  test("chute de couverture > 0,02 ET CI > 0,3 ⇒ rouge (combinaison sévère)", () => {
    const badge = computeQualityBadge(
      sonar({ bugs: 0, duplicated_lines_density: 0.05 }),
      ga({ tests: { coverage_start: 0.8, coverage_end: 0.5 }, ci: { failure_rate: 0.4 } }),
    );
    expect(badge).toBe("rouge");
  });

  test("≥2 critères disponibles en échec, sans atteindre la combinaison sévère ⇒ rouge", () => {
    const badge = computeQualityBadge(
      sonar({ bugs: 3, duplicated_lines_density: 0.5 }),
      ga({ tests: { coverage_start: 0.8, coverage_end: 0.8 }, ci: { failure_rate: 0.1 } }),
    );
    expect(badge).toBe("rouge");
  });

  test("critères calculés sur les seules données disponibles (bugs seul, en échec) ⇒ orange", () => {
    const badge = computeQualityBadge(sonar({ bugs: 1 }), ga({}));
    expect(badge).toBe("orange");
  });

  test("critères calculés sur les seules données disponibles (bugs seul, au vert) ⇒ vert", () => {
    const badge = computeQualityBadge(sonar({ bugs: 0 }), ga({}));
    expect(badge).toBe("vert");
  });
});

describe("le badge qualité n'entre jamais dans le calcul du rang/niveau/fourchette", () => {
  test("core/judge.ts ne référence jamais quality-badge.ts", () => {
    const grepOutput = execSync(String.raw`grep -l "quality-badge" src/core/judge.ts || true`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(grepOutput.trim()).toBe("");
  });

  test("core/registry.ts ne référence jamais quality-badge.ts", () => {
    const grepOutput = execSync(String.raw`grep -l "quality-badge" src/core/registry.ts || true`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(grepOutput.trim()).toBe("");
  });

  test("O2.sonar.ts ne produit jamais d'Evidence (path_ids vide, run() => [])", async () => {
    const mod = (await import("../../src/checks/core-repo-context/O2.sonar.js")) as { default: { path_ids: readonly string[]; run: (ctx: unknown, ref: unknown) => readonly unknown[] } };
    expect(mod.default.path_ids).toEqual([]);
    expect(mod.default.run(undefined, undefined)).toEqual([]);
  });

  test("aucun fichier de src/checks/** n'IMPORTE quality-badge.ts (une mention en docstring, ex. O2.sonar.ts, reste autorisée — seul un import réel pourrait faire fuiter le badge dans une Evidence)", () => {
    const grepOutput = execSync(String.raw`grep -rlE '^\s*import .*quality-badge' src/checks || true`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(grepOutput.trim()).toBe("");
  });
});
