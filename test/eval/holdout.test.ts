import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { runAntecedenceGuard, runHoldoutChecks, type HoldoutFile } from "../../evals/holdout.js";

const TEST_FILE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "..", "..");

const holdout = JSON.parse(readFileSync(resolve(REPO_ROOT, "evals", "holdout.json"), "utf8")) as HoldoutFile;

describe("eval de hold-out (Part 6, phase 2)", () => {
  test("la garde d'antériorité (git log) est verte", () => {
    const result = runAntecedenceGuard();
    expect(result.ok, result.message).toBe(true);
  });

  const results = runHoldoutChecks(holdout);

  test("produit une vérification par mutant du hold-out", () => {
    expect(results.length).toBe(Object.keys(holdout.mutants).length);
  });

  test.each(results.map((result) => [result.id, result] as const))("%s", (_id, result) => {
    expect(result.ok, result.message).toBe(true);
  });
});
