// `checks explain <marche> [profil]` :
// `src/report/explain.ts` (fonctions pures/quasi-pures réutilisées par
// `src/cli.ts`) et le comportement CLI observable (codes de sortie).
//
// Deux niveaux, comme `test/golden.test.ts` :
// - `explainMarche`/`explainMarcheForProfile`/`formatExplanation` appelées
//   directement (rapide, itératif) ;
// - le binaire construit (`dist/cli.js`, jamais les sources TS) pour l'AC sur
//   le CODE DE SORTIE réel — `checksCmd`/`exitOverride`/le mappage d'erreurs de
//   `src/cli.ts` ne sont exercés qu'en sous-processus, jamais en appelant
//   `runChecksExplain` directement (qui n'existe même pas hors de `cli.ts`).

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, test } from "vitest";

import { runAnalysis } from "../src/analyze.js";
import { loadReferentiel } from "../src/core/referentiel.js";
import { allMarcheIds, explainMarche, explainMarcheForProfile, formatExplanation } from "../src/report/explain.js";

const TEST_FILE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "..");
const CLI_PATH = join(REPO_ROOT, "dist", "cli.js");

beforeAll(() => {
  if (!existsSync(CLI_PATH)) {
    throw new Error(`"${CLI_PATH}" introuvable — lancer \`npm run build\` avant \`vitest run test/cli.checks-explain.test.ts\`.`);
  }
});

// ---------------------------------------------------------------------------
// `explainMarche` / `formatThreshold` — sans profil
// ---------------------------------------------------------------------------

describe("explainMarche : chemins de preuve, sources, seuils (sans profil)", () => {
  test("H4 : 2 chemins de preuve, sources et seuils formatés depuis le référentiel réel", () => {
    const { referentiel } = loadReferentiel();
    const explanation = explainMarche(referentiel, "H4");
    expect(explanation).toBeDefined();
    if (!explanation) return;

    expect(explanation.axe).toBe("H");
    expect(explanation.proofPaths).toHaveLength(2);
    const byId = new Map(explanation.proofPaths.map((proofPath) => [proofPath.path_id, proofPath]));
    expect(byId.get("H4.p1")?.threshold).toContain("RC.behavior_artifacts_specific_count");
    expect(byId.get("H4.p1")?.threshold).toContain("≥");
    expect(byId.get("H4.p2")?.source).toBe("GA");
    expect(explanation.counterProof?.description.length).toBeGreaterThan(0);
  });

  test("marche par défaut (T1) : aucun chemin de preuve, jamais un crash sur thresholdFor", () => {
    const { referentiel } = loadReferentiel();
    const explanation = explainMarche(referentiel, "T1");
    expect(explanation).toBeDefined();
    expect(explanation?.isDefault).toBe(true);
    expect(explanation?.proofPaths).toEqual([]);
    expect(formatExplanation(explanation!)).toContain("Marche par défaut");
  });

  test("marche inconnue ⇒ undefined, jamais un throw", () => {
    const { referentiel } = loadReferentiel();
    expect(explainMarche(referentiel, "Z9")).toBeUndefined();
  });

  test("formatThreshold : condition simple, et combinaison and/or lisibles", () => {
    const { referentiel } = loadReferentiel();
    const i4 = explainMarche(referentiel, "I4");
    const t2p2 = explainMarche(referentiel, "T2")?.proofPaths.find((p) => p.path_id === "T2.p2");
    expect(i4?.proofPaths[0]?.threshold).toContain("ET");
    expect(t2p2?.threshold).toContain("OU");
  });
});

describe("allMarcheIds : les 24 identifiants du référentiel réel, sans doublon", () => {
  test("24 ids exactement, correspondant aux axes réels", () => {
    const { referentiel } = loadReferentiel();
    const ids = allMarcheIds(referentiel);
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// AC : `checks explain <marche>` répond pour les 24 marches, sans crash
// ---------------------------------------------------------------------------

describe("explainMarche + formatExplanation : balayage des 24 marches (AC)", () => {
  test("aucune des 24 marches ne fait planter explainMarche/formatExplanation", () => {
    const { referentiel } = loadReferentiel();
    const ids = allMarcheIds(referentiel);
    expect(ids).toHaveLength(24);

    for (const marcheId of ids) {
      const explanation = explainMarche(referentiel, marcheId);
      expect(explanation, `${marcheId} devrait être expliquée`).toBeDefined();
      if (!explanation) continue;
      const text = formatExplanation(explanation);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("NaN");
    }
  });
});

// ---------------------------------------------------------------------------
// `explainMarcheForProfile` — avec un profil réel (arthur)
// ---------------------------------------------------------------------------

describe("explainMarcheForProfile : profil réel (arthur, AC)", () => {
  test("H4 fixtures/profiles/arthur : état prouvé, 2 observations chiffrées", () => {
    const { referentiel } = loadReferentiel();
    const base = explainMarche(referentiel, "H4");
    expect(base).toBeDefined();
    if (!base) return;

    const outcome = runAnalysis(join(REPO_ROOT, "fixtures", "profiles", "arthur"), "arthur", { includeExperimentalLlm: true });
    const explanation = explainMarcheForProfile(base, outcome, "arthur");

    expect(explanation.profile?.etat).toBe("prouvé");
    expect(explanation.profile?.observations.length).toBeGreaterThanOrEqual(1);
    expect(explanation.profile?.reason.length).toBeGreaterThan(0);

    const text = formatExplanation(explanation);
    expect(text).toContain("état résolu : prouvé");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("NaN");
  });
});

// ---------------------------------------------------------------------------
// CLI réelle (binaire construit) — codes de sortie (AC)
// ---------------------------------------------------------------------------

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

describe("checks explain <marche inconnue> : exit 3, jamais 1 (AC, corrigé par l'amendement du plan maître)", () => {
  test("checks explain Z9 : message français listant les marches valides, exit code 3", () => {
    const run = runCli(["checks", "explain", "Z9"]);
    expect(run.status).toBe(3);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("Marche inconnue");
    expect(run.stderr).toContain("Z9");
    for (const marcheId of ["T1", "H4", "I5", "P3", "O5"]) {
      expect(run.stderr).toContain(marcheId);
    }
  });
});

describe("checks explain H4 fixtures/profiles/arthur : sortie complète (AC)", () => {
  test("chemins, sources, seuils, valeur observée, état et raison, exit 0", () => {
    const run = runCli(["checks", "explain", "H4", join(REPO_ROOT, "fixtures", "profiles", "arthur")]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("H4.p1");
    expect(run.stdout).toContain("H4.p2");
    expect(run.stdout).toContain("seuil :");
    expect(run.stdout).toContain("source");
    expect(run.stdout).toContain("état résolu");
    expect(run.stdout).toContain("raison");
    expect(run.stdout).toContain("valeurs observées");
    expect(run.stdout).not.toContain("undefined");
    expect(run.stdout).not.toContain("NaN");
  });
});

describe("checks explain <marche> sans profil : sortie stable, exit 0", () => {
  test("H4 seule (sans profil) : proof paths et seuils, aucune section « Profil »", () => {
    const run = runCli(["checks", "explain", "H4"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("H4.p1");
    expect(run.stdout).not.toContain("Profil :");
  });
});

describe("checks explain <chemin de profil inexistant> : usage invalide, exit 3", () => {
  test("chemin de profil inexistant ⇒ exit 3, jamais un crash interne", () => {
    const run = runCli(["checks", "explain", "H4", "/chemin/totalement/inexistant-xyz"]);
    expect(run.status).toBe(3);
  });
});

// Filet contre une régression : `checks explain` ne doit plus jamais
// imprimer tout `referentiel.json` brut sur stdout.
test("checks explain n'imprime plus le référentiel brut", () => {
  const run = execFileSync(process.execPath, [CLI_PATH, "checks", "explain", "H4"], { encoding: "utf8" });
  expect(run).not.toContain('"schema_version"');
  expect(run).not.toContain('"thresholds"');
});
