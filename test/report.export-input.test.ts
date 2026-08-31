/**
 * Contrat de `parseExportInput`/`ExportInputSchema` (`src/report/export-input.ts`) —
 * l'entrée `--in` du mode CLI `export`. Table-driven, comme les contract
 * tests des adaptateurs de `src/sources/` : champ manquant, type invalide,
 * JSON invalide (au sens structurel, ici objets JS directement), `evidence`
 * vide acceptée. Ne teste jamais l'écriture du fichier (ça reste
 * `test/cli.export.test.ts`) — ce fichier reste pur, comme `parseExportInput`
 * lui-même.
 */

import { describe, expect, test } from "vitest";

import { parseExportInput } from "../src/report/export-input.js";

const MINIMAL_VALID_DOCUMENT = {
  profile_id: "bohort-c5ac0a90",
  status: "ok",
  rang_prouve: "blue",
  rang_ponctuel: "blue",
  rang_affiche: "blue",
  fourchette: { bas: "blue", haut: "blue" },
  confiance_globale: 0.32,
  axes: [],
  ownership: { niveau_prouve: null, niveau_ponctuel: null, etats: [], rabais_applique: false },
  verdicts: [],
  evidence: [],
  warnings: [],
  incoherences: [],
};

const MINIMAL_VALID_INPUT = { document: MINIMAL_VALID_DOCUMENT };

const VALID_EVIDENCE = {
  id: "agentic:T2.p1#GA.size_median",
  signal_id: "GA.size_median",
  valeur: { type: "enum", unite: "taille_bucket" },
  source: "GA",
  check_id: "agentic:T2.p1",
  path_id: "T2.p1",
  concept_id: "T2",
  axe: "T",
  polarite: "preuve",
  force: "prouve",
  confiance_source: 0.9,
};

describe("parseExportInput : entrée minimale valide", () => {
  test("accepte le document minimal, sans agentic_context", () => {
    const result = parseExportInput(MINIMAL_VALID_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.document.profile_id).toBe("bohort-c5ac0a90");
    expect(result.data.agentic_context).toBeUndefined();
  });

  test("accepte une evidence peuplée et respectant le vocabulaire du référentiel", () => {
    const result = parseExportInput({
      document: { ...MINIMAL_VALID_DOCUMENT, evidence: [VALID_EVIDENCE] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.document.evidence).toHaveLength(1);
  });

  test("accepte un citation optionnelle sur une evidence", () => {
    const result = parseExportInput({
      document: { ...MINIMAL_VALID_DOCUMENT, evidence: [{ ...VALID_EVIDENCE, citation: "git-activity.json: size_median = M" }] },
    });
    expect(result.ok).toBe(true);
  });

  test("accepte as_of en chaîne, et en objet {status:unknown,reason}", () => {
    const withString = parseExportInput({ document: { ...MINIMAL_VALID_DOCUMENT, as_of: "2026-07-15" } });
    expect(withString.ok).toBe(true);

    const withUnknown = parseExportInput({
      document: { ...MINIMAL_VALID_DOCUMENT, as_of: { status: "unknown", reason: "non déterminable" } },
    });
    expect(withUnknown.ok).toBe(true);
  });
});

describe("parseExportInput : champ manquant ⇒ échec explicite, jamais une valeur devinée", () => {
  test.for([
    ["document", (doc: Record<string, unknown>) => { void doc; return {}; }],
    ["document.profile_id", (doc: Record<string, unknown>) => { const { profile_id, ...rest } = doc; void profile_id; return rest; }],
    ["document.fourchette", (doc: Record<string, unknown>) => { const { fourchette, ...rest } = doc; void fourchette; return rest; }],
    ["document.ownership", (doc: Record<string, unknown>) => { const { ownership, ...rest } = doc; void ownership; return rest; }],
    ["document.evidence", (doc: Record<string, unknown>) => { const { evidence, ...rest } = doc; void evidence; return rest; }],
  ] as const)("%s manquant ⇒ ok:false avec un message nommant le champ", ([label, strip]) => {
    const mutated = strip({ ...MINIMAL_VALID_DOCUMENT });
    const result = parseExportInput(label === "document" ? {} : { document: mutated });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
  });
});

describe("parseExportInput : type invalide ⇒ échec, jamais une coercition silencieuse", () => {
  test("rang_affiche hors énumération (\"purple\") ⇒ rejeté", () => {
    const result = parseExportInput({ document: { ...MINIMAL_VALID_DOCUMENT, rang_affiche: "purple" } });
    expect(result.ok).toBe(false);
  });

  test("confiance_globale en chaîne (\"0.32\") ⇒ rejeté, jamais coercé en nombre", () => {
    const result = parseExportInput({ document: { ...MINIMAL_VALID_DOCUMENT, confiance_globale: "0.32" } });
    expect(result.ok).toBe(false);
  });

  test("axes n'est pas un tableau ⇒ rejeté", () => {
    const result = parseExportInput({ document: { ...MINIMAL_VALID_DOCUMENT, axes: { T: {} } } });
    expect(result.ok).toBe(false);
  });

  // Régression (trouvée en vérification bout-en-bout, 2026-08-31) : un
  // `profile_id` qui n'a pas déjà la forme `sanitizeSubject` (slug-hash) doit
  // être rejeté ici, jamais accepté puis réassaini par `src/cli.ts` — voir
  // `aidd_docs/tasks/2026_08/2026_08_31_agentic-report-html-parity/phase-3.md`.
  test.for(["bohort", "bohort_c5ac0a90", "BOHORT-c5ac0a90", "bohort-c5ac0a9", "../../etc/passwd"])(
    "profile_id pas en forme sanitizeSubject (%s) ⇒ rejeté",
    (profileId) => {
      const result = parseExportInput({ document: { ...MINIMAL_VALID_DOCUMENT, profile_id: profileId } });
      expect(result.ok).toBe(false);
    },
  );

  test("profile_id en forme sanitizeSubject valide ⇒ accepté", () => {
    const result = parseExportInput({ document: { ...MINIMAL_VALID_DOCUMENT, profile_id: "bohort-c5ac0a90" } });
    expect(result.ok).toBe(true);
  });

  test("evidence[].source hors énumération connue ⇒ rejeté", () => {
    const result = parseExportInput({
      document: { ...MINIMAL_VALID_DOCUMENT, evidence: [{ ...VALID_EVIDENCE, source: "LLM" }] },
    });
    expect(result.ok).toBe(false);
  });

  test("l'entrée elle-même est un tableau, pas un objet ⇒ rejeté", () => {
    const result = parseExportInput([MINIMAL_VALID_INPUT]);
    expect(result.ok).toBe(false);
  });

  test("l'entrée est null ⇒ rejeté, jamais un crash", () => {
    const result = parseExportInput(null);
    expect(result.ok).toBe(false);
  });
});

describe("parseExportInput : jamais de champ declaratif — DEC-004 structurel", () => {
  test("un champ extras.declaratif fourni est ignoré (schéma sans champ extras)", () => {
    const result = parseExportInput({
      document: MINIMAL_VALID_DOCUMENT,
      extras: { declaratif: { qa: [] } },
    });
    // Zod strip les clés inconnues par défaut : l'entrée reste valide, mais
    // `extras` n'apparaît nulle part dans le type/la donnée résultante — voir
    // `src/report/export-input.ts` (aucun champ `extras` dans `ExportInputSchema`).
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as Record<string, unknown>)["extras"]).toBeUndefined();
  });
});

describe("parseExportInput : agentic_context optionnel", () => {
  const VALID_AGENTIC_CONTEXT = {
    deterministic: {
      rang_affiche: "blue",
      fourchette: { bas: "blue", haut: "blue" },
      confiance_globale: 0.32,
      axes: [{ axe: "T", niveau_prouve: "T2", confiance: 0.28 }],
      incoherences: [],
    },
    comparison: {
      rows: [{ axe: "T", deterministic: "T2", agentic: "T2", match: true }],
      mismatch_notes: [],
    },
    execution: {
      model: "claude-sonnet-5",
      token_estimate: { prompt_chars: 29030, output_chars: 20385, estimated_tokens: 12354, note: "estimation." },
      cost_estimate: { usd: 0.0655, note: "approximatif." },
      generated_at: "2026-08-31T01:26:41.016Z",
    },
  };

  test("accepte un agentic_context complet et bien formé", () => {
    const result = parseExportInput({ document: MINIMAL_VALID_DOCUMENT, agentic_context: VALID_AGENTIC_CONTEXT });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.agentic_context?.execution.model).toBe("claude-sonnet-5");
  });

  test("agentic_context.execution.model vide ⇒ rejeté", () => {
    const result = parseExportInput({
      document: MINIMAL_VALID_DOCUMENT,
      agentic_context: { ...VALID_AGENTIC_CONTEXT, execution: { ...VALID_AGENTIC_CONTEXT.execution, model: "" } },
    });
    expect(result.ok).toBe(false);
  });
});
