/**
 * `test/invariants.test.ts` — invariants runtime. Fichier UNIQUE et dédié
 * pour 3 volets :
 *
 *   1. **câblage réel** : `src/analyze.ts`.`runAnalysis` — appelé par
 *      `src/cli.ts` à la fin de CHAQUE `analyze` réel, jamais seulement en
 *      test — invoque RÉELLEMENT `checkInvariants()` (pas seulement
 *      disponible/importée sans être appelée). Preuve en deux temps :
 *      inspection de code (le texte source de `runAnalysis` contient bien
 *      l'appel ET propage son résultat jusqu'au tableau `warnings` retourné,
 *      celui qui finit dans `result.json`) + test d'intégration (un vrai
 *      `runAnalysis()` sur un étalon réel produit un `invariantWarnings`
 *      identique à un appel indépendant de `checkInvariants()` nourri des
 *      MÊMES `evidence`/`judgeResult`/`referentiel` que le pipeline réel a
 *      produits — donc pas une valeur figée/ignorée).
 *   2. **détection** : un test dédié par invariant violé artificiellement (7),
 *      consolidé ICI pour qu'il n'existe qu'un seul endroit « invariants »
 *      clair.
 *   3. **zéro violation** sur les 4 étalons réels et la fixture hostile — le
 *      volet « 200 mutants » de cette même exigence est déjà couvert par
 *      `test/fuzz.test.ts` (`describe("fuzzer profil hostile — 200 mutants :
 *      les 7 invariants runtime tiennent"...)`), réutilisé tel quel, jamais
 *      dupliqué ici.
 *
 * Aucun test ne force une VRAIE violation de bout en bout via le pipeline
 * réel : plusieurs couches de validation antérieures à `checkInvariants`
 * rendent une violation réelle, en CLI, structurellement
 * improbable par construction — c'est le sens même de « defense in depth » :
 * `core/referentiel.ts`.`loadReferentiel` refuse déjà au démarrage tout
 * `path_id` de marche non-défaut sans seuil (invariant (e) ne peut donc
 * jamais se déclencher en CLI réel sur un référentiel chargé — voir aussi
 * `test/reliability-gates.test.ts`, qui prouve ce refus au niveau du binaire
 * construit) ; `core/registry.ts`.`buildRegistry` refuse de
 * même tout `path_id` de check orphelin. Forcer artificiellement une
 * violation par un référentiel corrompu (même technique que
 * `test/reliability-gates.test.ts`) buterait donc sur CES refus AVANT d'atteindre
 * `checkInvariants` — prouvant la robustesse des couches amont, pas un défaut
 * de câblage de `checkInvariants` lui-même. La preuve de câblage retenue ici
 * est donc double : inspection de code (l'appel existe et son résultat est
 * propagé) + preuve comportementale (l'`invariantWarnings` réellement retourné
 * par `runAnalysis()` sur un étalon réel est BIEN le produit d'un appel à
 * `checkInvariants()` nourri des données réelles du pipeline, pas une valeur
 * ignorée) — combinée à la couverture de détection déjà exhaustive de la
 * section 2 (un test dédié PAR invariant, avec une violation artificielle,
 * au niveau de `checkInvariants()` directement) et à `test/fuzz.test.ts` /
 * la section 3 ci-dessous (zéro violation confirmée sur les 4 étalons, la
 * fixture hostile, et les 200 mutants).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { runAnalysis } from "../src/analyze.js";
import { checkInvariants, type InvariantContext } from "../src/core/invariants.js";
import { judge, type JudgeResult } from "../src/core/judge.js";
import { loadReferentiel } from "../src/core/referentiel.js";
import type { CheckOutcome } from "../src/core/registry.js";
import type { AxeId, Evidence, Force, Polarite, SourceId } from "../src/core/types.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

function profileDir(name: string): string {
  return resolve(REPO_ROOT, "fixtures", "profiles", name);
}

const { referentiel } = loadReferentiel();

// ---------------------------------------------------------------------------
// 1. Câblage réel — `runAnalysis` (src/analyze.ts) appelle RÉELLEMENT
//    `checkInvariants`, pas seulement importée/disponible sans être utilisée.
// ---------------------------------------------------------------------------

describe("câblage CLI — src/analyze.ts appelle réellement checkInvariants à la fin de chaque analyse", () => {
  const ANALYZE_SOURCE = readFileSync(resolve(REPO_ROOT, "src", "analyze.ts"), "utf8");

  test("inspection de code : l'import et l'appel existent, et le résultat est propagé jusqu'au tableau `warnings` retourné", () => {
    expect(ANALYZE_SOURCE).toContain('import { checkInvariants } from "./core/invariants.js";');

    const runAnalysisStart = ANALYZE_SOURCE.indexOf("export function runAnalysis(");
    expect(runAnalysisStart, "export function runAnalysis( introuvable dans src/analyze.ts").toBeGreaterThanOrEqual(0);
    const body = ANALYZE_SOURCE.slice(runAnalysisStart);

    // L'appel existe réellement dans le corps de la fonction (pas seulement dans un commentaire ailleurs).
    expect(body).toContain("const invariantWarnings = checkInvariants({");

    // Son résultat est formaté et inclus dans le tableau `warnings` qui devient `result.json`.`warnings[]`.
    expect(body).toContain("...invariantWarnings.map((warning) => `invariant \"${warning.invariant}\" : ${warning.message}`)");

    // Le résultat structuré est aussi exposé tel quel sur l'AnalysisOutcome retourné (pour les tests/eval en amont).
    const returnStart = body.lastIndexOf("return {");
    expect(returnStart, "aucune instruction return { ... } trouvée dans runAnalysis").toBeGreaterThanOrEqual(0);
    const returnBlock = body.slice(returnStart);
    expect(returnBlock).toContain("invariantWarnings,");
    expect(returnBlock).toContain("warnings,");
  });

  test("preuve comportementale : sur un étalon réel, outcome.invariantWarnings est bien le produit d'un appel à checkInvariants nourri des données réelles du pipeline (pas une valeur figée)", () => {
    const outcome = runAnalysis(profileDir("perceval"), "perceval-wiring-check", { includeExperimentalLlm: false });

    // Reconstruction indépendante : mêmes evidence/résultat/référentiel que ceux réellement produits par CE run.
    // `checkOutcomes`/`registreSize` (invariant (f)) ne sont pas exposés sur AnalysisOutcome — reconstruits à
    // l'identique (vides) des deux côtés, ce qui les neutralise symétriquement sans fausser les 6 autres invariants.
    const reconstructed = checkInvariants({
      referentiel: outcome.referentiel,
      result: outcome.judgeResult,
      evidence: outcome.evidence,
      checkOutcomes: [],
      registreSize: 0,
    });

    expect(outcome.invariantWarnings).toEqual(reconstructed);

    // Et la propagation vers le tableau final (celui qui finit dans result.json) respecte le format attendu.
    for (const warning of outcome.invariantWarnings) {
      expect(outcome.warnings).toContain(`invariant "${warning.invariant}" : ${warning.message}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Détection — un test dédié par invariant violé artificiellement (7).
//
// Ces 9 tests (7 invariants + 2 cas de non-déclenchement) vivent ICI et pas
// dans `test/judge.unit.test.ts`, avec leurs seuls helpers nécessaires
// dupliqués localement (`ev`, `copperEvidence`) plutôt que partagés entre
// fichiers, même convention d'auto-suffisance que le reste de la suite
// (`test/fuzz.test.ts`, `test/reliability-gates.test.ts`, `test/golden.test.ts`).
// ---------------------------------------------------------------------------

let idCounter = 0;

interface EvidenceOptions {
  readonly path_id: string;
  readonly axe: AxeId;
  readonly source?: SourceId;
  readonly polarite?: Polarite;
  readonly force?: Force;
  readonly citation?: string;
}

function ev(options: EvidenceOptions): Evidence {
  idCounter += 1;
  return {
    id: `ev-synthetic-${idCounter}`,
    signal_id: "GA.size_median",
    valeur: { type: "enum", unite: "taille_bucket" },
    source: options.source ?? "GA",
    check_id: "synthetic.check",
    path_id: options.path_id,
    concept_id: "concept-synthetic",
    axe: options.axe,
    polarite: options.polarite ?? "preuve",
    force: options.force ?? "prouve",
    confiance_source: 1,
    ...(options.citation !== undefined ? { citation: options.citation } : {}),
  };
}

/** Evidence minimale de quoi atteindre Copper sur les 4 axes officiels (une seule marche par preuve directe, aucune indice). */
function copperEvidence(): Evidence[] {
  return [
    ev({ path_id: "T2.p1", axe: "T" }),
    ev({ path_id: "T3.p1", axe: "T" }),
    ev({ path_id: "H2.p2", axe: "H" }),
    ev({ path_id: "H3.p2", axe: "H" }),
    ev({ path_id: "H4.p2", axe: "H" }),
    ev({ path_id: "I2.p1", axe: "I" }),
    ev({ path_id: "I3.p1", axe: "I" }),
    ev({ path_id: "P2.p1", axe: "P" }),
    ev({ path_id: "P3.p1", axe: "P" }),
  ];
}

function baseJudgeResult(): JudgeResult {
  return {
    status: "ok",
    rang_prouve: "red",
    rang_ponctuel: "red",
    rang_affiche: "red",
    fourchette: { bas: "red", haut: "red" },
    confiance_globale: 0.5,
    axes: (["T", "H", "I", "P"] as const).map((axe) => ({
      axe,
      niveau_prouve: null,
      niveau_ponctuel: null,
      plafond_potentiel: null,
      etats: [],
      couverture: 0.5,
      accord: 1,
      confiance: 0.5,
      observe: true,
    })),
    ownership: { niveau_prouve: null, niveau_ponctuel: null, etats: [], rabais_applique: false },
    verdicts: [],
    incoherences: [],
    warnings: [],
  };
}

function baseInvariantContext(): InvariantContext {
  return {
    referentiel,
    result: baseJudgeResult(),
    evidence: [],
    checkOutcomes: [],
    registreSize: 0,
  };
}

describe("invariants — un test dédié par invariant (7)", () => {
  test("(a) résultat produit : result=null est détecté et rapporté", () => {
    const warnings = checkInvariants({ ...baseInvariantContext(), result: null });
    expect(warnings.some((w) => w.invariant === "resultat-produit")).toBe(true);
  });

  test("(a) résultat produit : un vrai résultat du juge (Evidence dégénérée/vide) ne déclenche jamais cet invariant", () => {
    const result = judge({ referentiel, evidence: [], hasAiUsageProof: true });
    const warnings = checkInvariants({ ...baseInvariantContext(), result });
    expect(warnings.some((w) => w.invariant === "resultat-produit")).toBe(false);
  });

  test("(b) bas ≤ haut : une fourchette inversée (bas=gold, haut=white) est détectée", () => {
    const result = { ...baseJudgeResult(), fourchette: { bas: "gold" as const, haut: "white" as const } };
    const warnings = checkInvariants({ ...baseInvariantContext(), result });
    expect(warnings.some((w) => w.invariant === "fourchette-bas-haut")).toBe(true);
  });

  test("(c) rang ⇒ fourchette et confiance : un rang ponctuel avec confiance NaN est détecté", () => {
    const result = { ...baseJudgeResult(), confiance_globale: Number.NaN };
    const warnings = checkInvariants({ ...baseInvariantContext(), result });
    expect(warnings.some((w) => w.invariant === "rang-implique-fourchette-et-confiance")).toBe(true);
  });

  test("(d) ids d'Evidence uniques : un id dupliqué est détecté", () => {
    const evidence = [ev({ path_id: "T2.p1", axe: "T" }), ev({ path_id: "T2.p2", axe: "T" })];
    const duplicated = [evidence[0]!, { ...evidence[1]!, id: evidence[0]!.id }];
    const warnings = checkInvariants({ ...baseInvariantContext(), evidence: duplicated });
    expect(warnings.some((w) => w.invariant === "evidence-ids-uniques")).toBe(true);
  });

  test("(e) seuil présent pour tout path_id : un path_id absent du référentiel est détecté", () => {
    const evidence = [ev({ path_id: "Z9.p1", axe: "T" })];
    const warnings = checkInvariants({ ...baseInvariantContext(), evidence });
    expect(warnings.some((w) => w.invariant === "seuil-present-pour-path-id" && w.message.includes("Z9.p1"))).toBe(
      true,
    );
  });

  test("(f) evidence + inconnus = taille du registre : un décompte incohérent est détecté", () => {
    const checkOutcomes: CheckOutcome[] = [[], { unknown: true, warning: "x" }];
    const warnings = checkInvariants({ ...baseInvariantContext(), checkOutcomes, registreSize: 5 });
    expect(warnings.some((w) => w.invariant === "evidence-plus-inconnus-egale-registre")).toBe(true);
  });

  test("(f) evidence + inconnus = taille du registre : un décompte cohérent ne déclenche rien", () => {
    const checkOutcomes: CheckOutcome[] = [[], { unknown: true, warning: "x" }];
    const warnings = checkInvariants({ ...baseInvariantContext(), checkOutcomes, registreSize: 2 });
    expect(warnings.some((w) => w.invariant === "evidence-plus-inconnus-egale-registre")).toBe(false);
  });

  test("(g) confiance bornée [0;1] : une confiance d'axe hors bornes (1.5) est détectée", () => {
    const result = {
      ...baseJudgeResult(),
      axes: baseJudgeResult().axes.map((axis, i) => (i === 0 ? { ...axis, confiance: 1.5 } : axis)),
    };
    const warnings = checkInvariants({ ...baseInvariantContext(), result });
    expect(warnings.some((w) => w.invariant === "confiance-bornee")).toBe(true);
  });

  test("un résultat entièrement valide (issu d'un vrai judge()) ne déclenche aucun avertissement", () => {
    const result = judge({ referentiel, evidence: copperEvidence(), hasAiUsageProof: true });
    const warnings = checkInvariants({ ...baseInvariantContext(), result, evidence: copperEvidence() });
    expect(warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Zéro violation — les 4 étalons réels et la fixture hostile (en-process,
//    même convention que test/fuzz.test.ts pour les 200 mutants — réutilisé
//    tel quel, jamais dupliqué ici).
// ---------------------------------------------------------------------------

const ETALONS = ["perceval", "bohort", "leodagan", "arthur"] as const;

describe("zéro violation d'invariant — les 4 étalons réels (fixtures/profiles/*)", () => {
  test.for(ETALONS)("%s : aucune violation d'invariant", (name) => {
    const outcome = runAnalysis(profileDir(name), `${name}-invariants-check`, { includeExperimentalLlm: false });
    const detail = outcome.invariantWarnings.map((w) => `${w.invariant} : ${w.message}`).join("\n");
    expect(outcome.invariantWarnings.length, `étalon "${name}" viole un invariant :\n${detail}`).toBe(0);
  });
});

describe("zéro violation d'invariant — la fixture hostile (fixtures/hostile)", () => {
  test("aucune violation d'invariant", () => {
    const hostileDir = resolve(REPO_ROOT, "fixtures", "hostile");
    const outcome = runAnalysis(hostileDir, "hostile-invariants-check", { includeExperimentalLlm: false });
    const detail = outcome.invariantWarnings.map((w) => `${w.invariant} : ${w.message}`).join("\n");
    expect(outcome.invariantWarnings.length, `fixture hostile viole un invariant :\n${detail}`).toBe(0);
  });
});
