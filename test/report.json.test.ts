// `src/report/json.ts` et `src/report/runs.ts` : tri de
// `evidence[]`, assainissement des valeurs non finies, forme du document
// final, et delta d'historique (dont le cas « fichier tronqué ignoré »).
//
// Utilise `runAnalysis` (`src/analyze.ts`) directement sur un profil
// étalon réel plutôt que des `Evidence` synthétiques pour `buildResultDocument`
// — la forme du document final dépend de la vraie sortie du juge, jamais d'un
// mock (cohérent avec les autres tests de bout en bout de ce dépôt).

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { runAnalysis } from "../src/analyze.js";
import type { Evidence } from "../src/core/types.js";
import {
  IGNORED_FIELDS,
  RESULT_SCHEMA_VERSION,
  buildResultDocument,
  readToolVersion,
  sanitizeNonFinite,
  sortEvidence,
} from "../src/report/json.js";
import { writeRunHistory, type DeltaOutcome } from "../src/report/runs.js";

const TEST_FILE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "..");

const scratchDirs: string[] = [];
function makeScratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

let idCounter = 0;
function evidence(overrides: Partial<Evidence> & Pick<Evidence, "axe" | "path_id" | "source" | "check_id">): Evidence {
  idCounter += 1;
  return {
    id: `ev-${idCounter}`,
    signal_id: "sig",
    valeur: { type: "boolean", unite: "bool" },
    polarite: "preuve",
    force: "prouve",
    concept_id: "concept",
    confiance_source: 1,
    ...overrides,
  };
}

describe("sortEvidence : tri (axe, marche, source, check_id) en points de code", () => {
  test("ordre de sortie stable, indépendant de l'ordre d'entrée", () => {
    const items: Evidence[] = [
      evidence({ axe: "H", path_id: "H2.p1", source: "RC", check_id: "H2.b" }),
      evidence({ axe: "T", path_id: "T2.p1", source: "GA", check_id: "T2.a" }),
      evidence({ axe: "H", path_id: "H1.p1", source: "GA", check_id: "H1.a" }),
      evidence({ axe: "H", path_id: "H2.p1", source: "GA", check_id: "H2.a" }),
    ];

    const sorted = sortEvidence(items);

    expect(sorted.map((item) => [item.axe, item.path_id.split(".")[0], item.source, item.check_id])).toEqual([
      ["H", "H1", "GA", "H1.a"],
      ["H", "H2", "GA", "H2.a"],
      ["H", "H2", "RC", "H2.b"],
      ["T", "T2", "GA", "T2.a"],
    ]);
  });

  test("jamais localeCompare/Intl : ordre en points de code, ex. majuscules avant minuscules", () => {
    const items: Evidence[] = [
      evidence({ axe: "T", path_id: "T1.p1", source: "GA", check_id: "z-check" }),
      evidence({ axe: "T", path_id: "T1.p1", source: "GA", check_id: "A-check" }),
    ];
    const sorted = sortEvidence(items);
    // Point de code : 'A' (0x41) < 'z' (0x7A) — vrai aussi en locale, mais ici
    // vérifié pour des identifiants qui divergeraient sous un tri localisé
    // (ex. « é » vs « f »), non représentables avec des check_id ASCII stricts
    // du référentiel — l'invariant de code est ce que ce test fige.
    expect(sorted.map((item) => item.check_id)).toEqual(["A-check", "z-check"]);
  });

  test("ne mute pas le tableau d'entrée", () => {
    const items: Evidence[] = [
      evidence({ axe: "T", path_id: "T2.p1", source: "GA", check_id: "b" }),
      evidence({ axe: "T", path_id: "T1.p1", source: "GA", check_id: "a" }),
    ];
    const before = [...items];
    sortEvidence(items);
    expect(items).toEqual(before);
  });
});

describe("sanitizeNonFinite : jamais un null silencieux pour NaN/Infinity", () => {
  test("NaN et Infinity, au premier niveau et imbriqués, deviennent {status, reason}", () => {
    const input = {
      ok: 0.42,
      bad: NaN,
      nested: { deep: Infinity, list: [1, -Infinity, "texte", null, true] },
    };
    const out = sanitizeNonFinite(input) as Record<string, unknown>;

    expect(out.ok).toBe(0.42);
    expect(out.bad).toEqual({ status: "unknown", reason: expect.stringContaining("non finie") });
    const nested = out.nested as Record<string, unknown>;
    expect(nested.deep).toEqual({ status: "unknown", reason: expect.stringContaining("non finie") });
    const list = nested.list as unknown[];
    expect(list[0]).toBe(1);
    expect(list[1]).toEqual({ status: "unknown", reason: expect.stringContaining("non finie") });
    expect(list[2]).toBe("texte");
    expect(list[3]).toBeNull();
    expect(list[4]).toBe(true);
  });

  test("laisse null volontaire, chaînes et booléens intacts", () => {
    expect(sanitizeNonFinite(null)).toBeNull();
    expect(sanitizeNonFinite("texte")).toBe("texte");
    expect(sanitizeNonFinite(false)).toBe(false);
    expect(sanitizeNonFinite(0)).toBe(0);
  });
});

describe("buildResultDocument : forme du document final (profil réel, arthur)", () => {
  function buildArthurDocument() {
    const arthurDir = join(REPO_ROOT, "fixtures", "profiles", "arthur");
    const outcome = runAnalysis(arthurDir, "arthur-abcd1234", { includeExperimentalLlm: true });
    return buildResultDocument(outcome, "arthur-abcd1234");
  }

  test("porte tous les champs obligatoires (tâche 1)", () => {
    const doc = buildArthurDocument();

    expect(doc.schema_version).toBe(RESULT_SCHEMA_VERSION);
    expect(doc.tool_version).toBe(readToolVersion());
    expect(doc.referentiel_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.node_version).toBe(process.versions.node);
    expect(typeof doc.as_of === "string" || (typeof doc.as_of === "object" && doc.as_of !== null)).toBe(true);
    expect(doc.profile_id).toBe("arthur-abcd1234");
    expect(["ok", "indeterminate"]).toContain(doc.status);
    expect(Array.isArray(doc.warnings)).toBe(true);
    expect(Array.isArray(doc.incoherences)).toBe(true);
    expect(Array.isArray(doc.evidence)).toBe(true);
    expect(doc.evidence.length).toBeGreaterThan(0);
    expect(Array.isArray(doc.verdicts)).toBe(true);
    expect(doc.verdicts.length).toBe(4);
    expect(doc.axes.length).toBe(4);
    expect(doc.fourchette.bas).toBeDefined();
    expect(doc.fourchette.haut).toBeDefined();
    expect(typeof doc.confiance_globale).toBe("number");
    expect(doc.ownership).toBeDefined();
  });

  test("liste explicitement les pièces/champs délibérément ignorés (tâche 1)", () => {
    const doc = buildArthurDocument();
    const champs = doc.pieces_et_champs_ignores.map((item) => item.champ);

    expect(champs).toEqual(IGNORED_FIELDS.map((item) => item.champ));
    expect(champs).toContain("code/");
    expect(champs).toContain("git-activity.json:reverted");
    expect(champs).toContain("git-activity.json:message_convention_compliance");
    expect(champs).toContain("git-activity.json:repositories");
    expect(champs).toContain("git-activity.json:median_runs_to_green");
    expect(champs).toContain("git-activity.json:tokens_per_week");
    for (const item of doc.pieces_et_champs_ignores) {
      expect(item.raison.length).toBeGreaterThan(0);
    }
  });

  test("evidence[] est trié (tâche 2)", () => {
    const doc = buildArthurDocument();
    expect(doc.evidence).toEqual(sortEvidence(doc.evidence));
  });

  test("chaque facteur de confiance (couverture, accord) et le produit sont dans [0;1], arrondis à 2 décimales (AC)", () => {
    const doc = buildArthurDocument();
    for (const axis of doc.axes) {
      for (const factor of [axis.couverture, axis.accord, axis.confiance]) {
        expect(factor).toBeGreaterThanOrEqual(0);
        expect(factor).toBeLessThanOrEqual(1);
        expect(Math.round(factor * 100) / 100).toBe(factor);
        // Aucune dérive de flottant à la sérialisation (`JSON.stringify` rend la
        // représentation décimale la plus courte qui round-trip — jamais de
        // type "0.6999999999999998").
        expect(JSON.stringify(factor)).not.toMatch(/9{5,}|0{5,}\d/);
      }
    }
    expect(doc.confiance_globale).toBeGreaterThanOrEqual(0);
    expect(doc.confiance_globale).toBeLessThanOrEqual(1);
  });

  test("aucun NaN/Infinity/undefined ne survit à la sérialisation JSON", () => {
    const doc = buildArthurDocument();
    const raw = JSON.stringify(doc);
    expect(raw).not.toContain("NaN");
    expect(raw).not.toContain("Infinity");
    expect(raw).not.toContain("undefined");
  });
});

describe("writeRunHistory : archive runs/<horodatage>.json + delta (tâche 5)", () => {
  function fakeArthurDocument() {
    const arthurDir = join(REPO_ROOT, "fixtures", "profiles", "arthur");
    const outcome = runAnalysis(arthurDir, "arthur-test", { includeExperimentalLlm: true });
    return buildResultDocument(outcome, "arthur-test");
  }

  test("premier run : aucune exécution précédente comparable", () => {
    const subjectDir = makeScratchDir("recognaize-runs-first-");
    const doc = fakeArthurDocument();

    const outcome = writeRunHistory(subjectDir, doc);

    expect(outcome.delta.status).toBe("unknown");
    const runsDir = join(subjectDir, "runs");
    const files = readdirSync(runsDir);
    expect(files).toContain(outcome.runFilename);
    expect(files).toContain(outcome.runFilename.replace(/\.json$/, ".delta.json"));
  });

  test("deuxième run comparable : delta calculé vs le précédent (même sujet, même schema_version)", async () => {
    const subjectDir = makeScratchDir("recognaize-runs-second-");
    const first = fakeArthurDocument();
    const firstOutcome = writeRunHistory(subjectDir, first);

    // Horodatages de nom de fichier à la seconde près (`toISOString`) : une
    // micro-pause garantit un second nom de fichier strictement postérieur,
    // pour un tri déterministe côté test (le code de production, lui, reste
    // correct même à égalité — dernier fichier lu par ordre alphabétique).
    await new Promise((r) => setTimeout(r, 5));

    const second = fakeArthurDocument();
    const secondOutcome = writeRunHistory(subjectDir, second);

    expect(secondOutcome.runFilename).not.toBe(firstOutcome.runFilename);
    expect(secondOutcome.delta.status).toBe("ok");
    const delta = secondOutcome.delta as Extract<DeltaOutcome, { status: "ok" }>;
    expect(delta.delta.run_precedent).toBe(firstOutcome.runFilename);
    expect(delta.delta.rang_affiche.changed).toBe(false);
    expect(delta.delta.rang_affiche.avant).toBe(first.rang_affiche);
    expect(delta.delta.rang_affiche.apres).toBe(second.rang_affiche);
  });

  test("un runs/*.json tronqué est ignoré pour le delta, sans crash (AC)", () => {
    const subjectDir = makeScratchDir("recognaize-runs-corrupt-");
    const runsDir = join(subjectDir, "runs");
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, "0000-01-01T00-00-00-000Z.json"), "{ceci n'est pas du JSON valide", "utf8");
    // Existe déjà avant la première écriture réelle — simule un run précédent tronqué.

    const doc = fakeArthurDocument();
    const outcome = writeRunHistory(subjectDir, doc);

    // Aucun crash (la ligne ci-dessus n'a pas levé) et aucune comparaison
    // trouvée puisque le seul fichier antérieur est illisible.
    expect(outcome.delta.status).toBe("unknown");
  });

  test("un runs/*.json d'un schema_version différent n'est jamais comparé", () => {
    const subjectDir = makeScratchDir("recognaize-runs-other-schema-");
    const runsDir = join(subjectDir, "runs");
    mkdirSync(runsDir, { recursive: true });
    const other = { ...fakeArthurDocument(), schema_version: "9.9.9-autre-schema" };
    writeFileSync(join(runsDir, "0000-01-01T00-00-00-000Z.json"), `${JSON.stringify(other)}\n`, "utf8");

    const doc = fakeArthurDocument();
    const outcome = writeRunHistory(subjectDir, doc);

    expect(outcome.delta.status).toBe("unknown");
  });
});
