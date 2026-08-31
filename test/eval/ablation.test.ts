// Mirroir vitest de `evals/ablation.ts` (même convention que
// `test/eval/anti-literal.test.ts`) : rend l'eval d'ablation visible dans
// `npm test`/CI, sans dupliquer le calcul (les deux consomment
// `runAblationChecks` telle quelle).
//
// Verrouille un correctif de `core/judge.ts` mis en évidence par ablation sur
// l'étalon RÉEL `arthur` (facteur "accord" non monotone sous retrait
// d'`Evidence`, et masquage d'une contre-preuve de précédence inférieure par
// une source de précédence supérieure devenu décisif après ablation) :
// (1) `sourceEtat` n'infirme plus une marche sur la seule foi d'une
// contre-preuve `force: "indice"` isolée (elle résout à `"indice"`, pas
// `"infirmé"` — `force` est un attribut structurel du `proof_path`,
// `referentiel.json`, jamais une marche « inventée » par un check) ;
// (2) `computeAxisConfidence` calcule l'accord comme
// `1 − (marches incertaines / marches résolues)` sur l'état RÉSOLU de chaque
// marche, plutôt que `1 − contradictions retenues / marches à sources
// multiples` (ce ratio ne pouvait mathématiquement jamais baisser quand la
// source perdante d'une contradiction disparaissait) ; (3) le rabais
// Ownership plafonne désormais `fourchette.haut` sur le niveau Ownership
// PLAFOND OPTIMISTE, pas sur son niveau PROUVÉ (qui pilote toujours le rang
// affiché et `fourchette.bas`, inchangé). Le 6ᵉ cas
// (`leodagan:git-activity.json:documented-fourchette`) n'était PAS un
// symptôme de ce bug — une estimation de plan a priori, jamais vérifiée avant
// `evals/ablation.ts`, corrigée directement dans `DOCUMENTED_FOURCHETTES`
// (`evals/ablation.ts`) plutôt que dans le juge.
//
// Les 6 cas passent RÉELLEMENT (pas par affaiblissement d'aucune assertion de
// `evals/ablation.ts` — le calcul est strictement le même, consommé tel
// quel) : toutes les vérifications produites passent par le même `test.each`
// normal.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { runAblationChecks, type ExpectedFile } from "../../evals/ablation.js";

const TEST_FILE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "..", "..");

// Calculé UNE fois, à la collection des tests (synchrone, comme
// `evals/run.ts`.`runMainMatrix()`) — chaque vérification devient son propre
// `test()` nommé pour la visibilité CI, plutôt qu'une boucle `expect` opaque
// dans un seul test.
const expected = JSON.parse(readFileSync(resolve(REPO_ROOT, "evals", "expected.json"), "utf8")) as ExpectedFile;
const results = runAblationChecks(expected);

describe("eval d'ablation (Part 6, phase 1)", () => {
  test("produit au moins une vérification par étalon et par pièce porteuse présente", () => {
    expect(results.length).toBeGreaterThan(0);
  });

  test.each(results.map((result) => [result.id, result] as const))("%s", (_id, result) => {
    expect(result.ok, result.message).toBe(true);
  });
});
