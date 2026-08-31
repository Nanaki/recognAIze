// Contract tests pour `src/core/as-of.ts` — dérivation
// de la date de référence `as_of` et de la fenêtre d'analyse, JAMAIS
// `Date.now()`. Couvre la précédence documentée en tête de fichier source :
// period > merged_at > context_files > --as-of explicite > inconnu.

import { describe, expect, test } from "vitest";

import { deriveAsOf } from "../../src/core/as-of.js";

describe("deriveAsOf — précédence (a) period", () => {
  test("period présente et valide ⇒ as_of = to, fenêtre = [from, to]", () => {
    const result = deriveAsOf({ period: { from: "2026-01-15", to: "2026-07-15" } });

    expect(result).toEqual({
      status: "ok",
      data: {
        asOf: "2026-07-15",
        window: { from: "2026-01-15", to: "2026-07-15" },
        source: "period",
      },
    });
  });

  test("bornes inversées (from > to) ⇒ period rejetée, retombe sur la source suivante", () => {
    const result = deriveAsOf({
      period: { from: "2026-07-15", to: "2026-01-15" },
      mergedAts: ["2026-06-01T10:00:00Z"],
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.source).toBe("merged_at");
    }
  });

  test("period incomplète (to manquant) ⇒ rejetée, retombe sur la source suivante", () => {
    const result = deriveAsOf({
      period: { from: "2026-01-15" },
      mergedAts: ["2026-06-01T10:00:00Z"],
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.source).toBe("merged_at");
    }
  });
});

describe("deriveAsOf — précédence (b) merged_at la plus récente", () => {
  test("as_of = date (UTC, jour) de la merged_at la plus récente, fenêtre = 180 jours avant", () => {
    const result = deriveAsOf({
      mergedAts: ["2026-06-01T10:00:00Z", "2026-07-15T14:35:00Z", "2026-03-01T00:00:00Z"],
    });

    expect(result).toEqual({
      status: "ok",
      data: {
        asOf: "2026-07-15",
        window: { from: "2026-01-16", to: "2026-07-15" },
        source: "merged_at",
      },
    });
  });

  test("entrées invalides (null, non-chaîne, date illisible) sont ignorées sans faire planter la dérivation", () => {
    const result = deriveAsOf({
      mergedAts: [null, undefined, 42, "pas une date", "2026-05-10T00:00:00Z"],
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.asOf).toBe("2026-05-10");
      expect(result.data.source).toBe("merged_at");
    }
  });

  test("mergedAts vide ⇒ retombe sur la source suivante", () => {
    const result = deriveAsOf({ mergedAts: [], contextFilesLastUpdated: "2026-07-12" });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.source).toBe("context_files");
    }
  });
});

describe("deriveAsOf — précédence (c) context_files.last_updated", () => {
  test("utilisée seulement si period et merged_at sont indisponibles", () => {
    const result = deriveAsOf({ contextFilesLastUpdated: "2026-07-12" });

    expect(result).toEqual({
      status: "ok",
      data: {
        asOf: "2026-07-12",
        window: { from: "2026-01-13", to: "2026-07-12" },
        source: "context_files",
      },
    });
  });
});

describe("deriveAsOf — précédence (d) --as-of explicite", () => {
  test("utilisée en tout dernier recours", () => {
    const result = deriveAsOf({ explicitAsOf: "2026-08-01" });

    expect(result).toEqual({
      status: "ok",
      data: {
        asOf: "2026-08-01",
        window: { from: "2026-02-02", to: "2026-08-01" },
        source: "explicit",
      },
    });
  });

  test("--as-of explicite invalide et aucune autre source ⇒ status unknown, reason non vide", () => {
    const result = deriveAsOf({ explicitAsOf: "pas une date" });

    expect(result.status).toBe("unknown");
    if (result.status === "unknown") {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("deriveAsOf — aucune source", () => {
  test("input entièrement vide ⇒ status unknown, reason explicite", () => {
    const result = deriveAsOf({});

    expect(result).toEqual({
      status: "unknown",
      reason: expect.stringContaining("aucune source"),
    });
  });
});

describe("deriveAsOf — déterminisme", () => {
  test("le même input produit exactement le même résultat sur deux appels séparés", () => {
    const input = { period: { from: "2026-01-15", to: "2026-07-15" } };

    const first = deriveAsOf(input);
    const second = deriveAsOf(input);

    expect(first).toEqual(second);
  });

  test("le même input (source merged_at) produit exactement le même résultat sur deux appels séparés", () => {
    const input = { mergedAts: ["2026-06-01T10:00:00Z", "2026-07-15T14:35:00Z"] };

    const first = deriveAsOf(input);
    const second = deriveAsOf(input);

    expect(first).toEqual(second);
  });
});
