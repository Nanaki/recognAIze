/**
 * `test/fuzz.test.ts` — « Aucun profil inédit ne produit exit 1. » Exécute
 * les 200 mutants de `scripts/fuzz-profile.ts` (graine fixe, dérivés
 * uniquement des 4 étalons réels) et, pour CHACUN, asserte :
 *   - `runAnalysis` ne lève JAMAIS (équivalent en-process de « exit 1 ») ;
 *   - le document `result.json` (équivalent en-process : `buildResultDocument`,
 *     la MÊME fonction que `src/cli.ts`) reste structurellement valide
 *     (sérialisable, schéma attendu, `status` connu) ;
 *   - les 7 invariants runtime (`src/core/invariants.ts`.`checkInvariants`,
 *     RÉUTILISÉE — jamais réimplémentée) ne remontent AUCUNE violation.
 *
 * Exécution EN-PROCESS (même convention que `evals/ablation.ts`/
 * `evals/holdout.ts`), pas via le binaire construit : 200 appels à
 * `runAnalysis()` dans le MÊME process Node prennent quelques secondes, alors
 * que 200 `spawnSync` de `node dist/cli.js` (chacun avec son propre démarrage
 * V8/chargement de modules) représenteraient un facteur ~10-50× plus lent. Le
 * COÛT de ce choix : `runAnalysis()` seul ne couvre PAS le refus « pièces
 * insuffisantes » (exit 2) de `src/cli.ts`.`runAnalyze` — cette logique de
 * refus vit dans `cli.ts`, en amont de `runAnalysis()`, pas dans
 * `runAnalysis()` lui-même. Ce n'est pas une lacune pratique ici : chaque
 * mutant dérive d'un étalon RICHE (jusqu'à 18 fichiers) altéré par seulement
 * 1 à 3 mutations — aucun mutant ne peut structurellement retomber au cas
 * « profile.json seul » qui déclenche ce refus (déjà couvert, lui, par
 * `test/e2e-jury.test.ts`, cas « dossier vide »). L'assertion réellement
 * exercée par ce test est donc « exit 0 » à chaque mutant (`runAnalysis` ne
 * lève jamais).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import { runAnalysis, type AnalysisOutcome } from "../src/analyze.js";
import { RESULT_SCHEMA_VERSION, buildResultDocument } from "../src/report/json.js";
import { FUZZ_SEED, MUTANT_COUNT, buildMutants, type MutantPlan } from "../scripts/fuzz-profile.js";

const FUZZ_ROOT = mkdtempSync(join(tmpdir(), "recognaize-fuzz-"));
const MUTANTS: readonly MutantPlan[] = buildMutants(FUZZ_ROOT);

afterAll(() => {
  rmSync(FUZZ_ROOT, { recursive: true, force: true });
});

describe(`scripts/fuzz-profile.ts : génère exactement ${MUTANT_COUNT} mutants (graine fixe ${FUZZ_SEED})`, () => {
  test("compte exact, profile.json conservé pour chaque mutant", () => {
    expect(MUTANTS.length).toBe(MUTANT_COUNT);
    for (const mutant of MUTANTS) {
      expect(existsSync(join(mutant.dir, "profile.json")), `profile.json manquant pour ${mutant.name}`).toBe(true);
    }
  });

  test("chaque mutant porte au moins une mutation décrite", () => {
    for (const mutant of MUTANTS) {
      expect(mutant.mutations.length).toBeGreaterThan(0);
    }
  });
});

interface FuzzOutcome {
  readonly mutant: MutantPlan;
  readonly outcome: AnalysisOutcome;
}

/**
 * Exécute les 200 mutants UNE SEULE FOIS (pas dans un `test.for`/`beforeEach` —
 * même convention que `evals/ablation.ts`.`runAblationChecks`, calculée au
 * chargement du module) : un mutant qui fait lever `runAnalysis` est capturé
 * ici comme un ÉCHEC STRUCTURÉ (jamais laissé remonter — sinon un seul mutant
 * en échec empêcherait d'évaluer les 199 autres et de produire un rapport
 * complet, contraire à la tâche « ne pas ignorer un mutant en échec »).
 */
function runAllMutants(mutants: readonly MutantPlan[]): { readonly successes: readonly FuzzOutcome[]; readonly failures: readonly { mutant: MutantPlan; error: string }[] } {
  const successes: FuzzOutcome[] = [];
  const failures: { mutant: MutantPlan; error: string }[] = [];
  for (const mutant of mutants) {
    try {
      const outcome = runAnalysis(mutant.dir, mutant.name, { includeExperimentalLlm: false });
      successes.push({ mutant, outcome });
    } catch (cause) {
      failures.push({ mutant, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  return { successes, failures };
}

const { successes: FUZZ_SUCCESSES, failures: FUZZ_FAILURES } = runAllMutants(MUTANTS);

describe("fuzzer profil hostile — 200 mutants : jamais d'exception (équivalent exit 1)", () => {
  test("zéro exception sur les 200 mutants — la moindre exception est un défaut réel à corriger ou à signaler, jamais un mutant écarté", () => {
    const detail = FUZZ_FAILURES.map((f) => `  - ${f.mutant.name} (${f.mutant.profile}, mutations: ${f.mutant.mutations.join(" | ")}) : ${f.error}`).join("\n");
    expect(FUZZ_FAILURES.length, `${FUZZ_FAILURES.length}/${MUTANTS.length} mutant(s) ont fait lever runAnalysis :\n${detail}`).toBe(0);
  });
});

describe("fuzzer profil hostile — 200 mutants : result.json structurellement valide", () => {
  test.for(FUZZ_SUCCESSES)("$mutant.name : document sérialisable, schéma attendu", ({ mutant, outcome }) => {
    const document = buildResultDocument(outcome, mutant.name);
    expect(() => JSON.stringify(document)).not.toThrow();

    expect(document.schema_version).toBe(RESULT_SCHEMA_VERSION);
    expect(["ok", "indeterminate"]).toContain(document.status);
    expect(Array.isArray(document.axes)).toBe(true);
    expect(Array.isArray(document.evidence)).toBe(true);
    expect(Array.isArray(document.warnings)).toBe(true);
    expect(Array.isArray(document.verdicts)).toBe(true);
    expect(typeof document.confiance_globale).toBe("number");
    expect(document.confiance_globale).toBeGreaterThanOrEqual(0);
    expect(document.confiance_globale).toBeLessThanOrEqual(1);
    expect(document.fourchette).toBeDefined();
  });
});

describe("fuzzer profil hostile — 200 mutants : les 7 invariants runtime tiennent (src/core/invariants.ts, réutilisé)", () => {
  test.for(FUZZ_SUCCESSES)("$mutant.name : aucune violation d'invariant", ({ mutant, outcome }) => {
    const detail = outcome.invariantWarnings.map((w) => `${w.invariant} : ${w.message}`).join("\n");
    expect(outcome.invariantWarnings.length, `mutant "${mutant.name}" (${mutant.profile}) viole un invariant :\n${detail}`).toBe(0);
  });
});
