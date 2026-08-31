// Tests table-driven de `src/lib/median-from-buckets.ts`.
// Cas explicitement demandés par `aidd_docs/memory/testing.md` : vide, 1 classe,
// somme ≠ total, ex æquo → classe inférieure.

import { describe, expect, test } from "vitest";

import { isMedianUnknown, medianFromBuckets, type SizeBuckets } from "../../src/lib/median-from-buckets.js";

interface Case {
  readonly label: string;
  readonly buckets: SizeBuckets;
  readonly total?: number;
  readonly expected: string | { readonly unknown: true };
}

const cases: readonly Case[] = [
  { label: "histogramme vide (objet {})", buckets: {}, expected: { unknown: true } },
  { label: "histogramme à zéro explicite", buckets: { xs: 0, s: 0, m: 0, l: 0, xl: 0 }, expected: { unknown: true } },
  { label: "1 seule classe (m: 1)", buckets: { m: 1 }, expected: "m" },
  { label: "1 seule classe (xl: 7)", buckets: { xl: 7 }, expected: "xl" },
  {
    label: "acceptance criterion : {xs:4,s:12,m:24,l:7,xl:1} -> médiane M",
    buckets: { xs: 4, s: 12, m: 24, l: 7, xl: 1 },
    expected: "m",
  },
  {
    label: "ex æquo strict 50/50 entre s et m (5/5) -> classe inférieure (s)",
    buckets: { s: 5, m: 5 },
    expected: "s",
  },
  {
    label: "ex æquo strict 50/50 entre m et l (10/10) -> classe inférieure (m)",
    buckets: { m: 10, l: 10 },
    expected: "m",
  },
  {
    label: "majorité nette dans une classe (xs:1,s:1,m:8) -> m",
    buckets: { xs: 1, s: 1, m: 8 },
    expected: "m",
  },
  {
    label: "effectif impair, médiane unique (xs:1,s:1,m:1) -> s",
    buckets: { xs: 1, s: 1, m: 1 },
    expected: "s",
  },
  {
    label: "somme ≠ total déclaré -> inconnu",
    buckets: { xs: 4, s: 12, m: 24, l: 7, xl: 1 },
    total: 100,
    expected: { unknown: true },
  },
  {
    label: "somme == total déclaré -> calculée normalement",
    buckets: { xs: 4, s: 12, m: 24, l: 7, xl: 1 },
    total: 48,
    expected: "m",
  },
  {
    label: "classe négative -> inconnu",
    buckets: { xs: -1, s: 12, m: 24, l: 7, xl: 1 },
    expected: { unknown: true },
  },
  {
    label: "classe non finie (NaN) -> inconnu",
    buckets: { xs: Number.NaN, s: 12, m: 24, l: 7, xl: 1 },
    expected: { unknown: true },
  },
];

describe("medianFromBuckets", () => {
  test.for(cases)("$label", ({ buckets, total, expected }) => {
    const result = medianFromBuckets(buckets, total);
    if (typeof expected === "string") {
      expect(isMedianUnknown(result)).toBe(false);
      expect(result).toBe(expected);
    } else {
      expect(isMedianUnknown(result)).toBe(true);
    }
  });

  test("le résultat inconnu porte toujours une raison non vide", () => {
    const result = medianFromBuckets({});
    expect(isMedianUnknown(result)).toBe(true);
    if (isMedianUnknown(result)) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  test("ne lève jamais, même sur des entrées dégénérées combinées", () => {
    expect(() => medianFromBuckets({ xs: -5, s: Number.POSITIVE_INFINITY }, -1)).not.toThrow();
  });
});
