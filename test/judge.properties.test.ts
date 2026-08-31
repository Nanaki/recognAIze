/**
 * Property tests sur le référentiel jouet (`test/toy-referentiel.ts`) — les
 * propriétés générales du juge, indépendantes de tout check réel.
 * `test/judge.unit.test.ts` prouve chaque règle avec des exemples nommés ; ce
 * fichier prouve, avec `fast-check` et des `Evidence[]` générées, que ces
 * règles tiennent sur un vaste espace d'entrées, pas seulement les exemples
 * choisis à la main.
 *
 * N'importe NI `src/referentiel.json` NI rien sous `src/checks/**` — seul
 * `test/toy-referentiel.ts` (indépendant, voir sa documentation de tête) sert
 * de référentiel.
 *
 * --- Judgment calls documentés -----------
 *
 * 1. **« Monotonie » restreinte aux `Evidence` de polarité `preuve`, une seule
 *    source par (axe, marche) au sein d'un même scénario généré.** Une lecture
 *    totalement générale (« retirer N'IMPORTE QUELLE Evidence ne fait jamais
 *    monter le rang ni la confiance ») est FAUSSE pour ce juge, par
 *    construction et intentionnellement :
 *      (a) retirer une `contre-preuve` peut lever une marche « infirmée » —
 *          donc DÉBLOQUER une marche plus haute qui était plafonnée par elle
 *          (règle « jamais au-delà d'une marche infirmée »).
 *          C'est le comportement voulu : une contre-preuve retirée n'est plus
 *          une contre-preuve, elle ne doit plus bloquer.
 *      (b) quand deux sources SE CONTREDISENT sur une même marche, la
 *          précédence de source (RC > PR > GA > SO > S > DEC)
 *          retient l'état de la source la plus fiable, PAS le plus « fort » —
 *          une source de haute précédence mais d'état faible (`indice`) peut
 *          masquer une autre source de précédence plus faible mais d'état
 *          fort (`prouvé`). Retirer la source masquante FAIT alors apparaître
 *          l'état plus fort de l'autre source — augmentation légitime,
 *          conséquence directe et voulue de la précédence de source.
 *    Restreindre aux retraits de `preuve` (jamais de `contre-preuve`) et à un
 *    scénario sans contradiction inter-source par marche élimine ces deux
 *    causes connues et intentionnelles de non-monotonie, et teste la vraie
 *    propriété visée : « ajouter une preuve n'aide jamais à faire baisser, la
 *    retirer n'aide jamais à faire monter ».
 *
 * 2. **`resolveMarcheEtat` (liste `sources` d'une contradiction) et
 *    `buildRaison` (choix de LA citation retenue) doivent être indépendants
 *    de l'ORDRE du tableau `evidence` reçu par `judge()`** : les deux sont
 *    triés par {@link SOURCE_PRECEDENCE} (voir les commentaires dans
 *    `judge.ts`) précisément pour garantir cette indépendance. Rang,
 *    fourchette, confiance et états sont indépendants de l'ordre par
 *    construction ; seuls ces deux textes d'explication (« Incohérences »,
 *    `Verdict.raison`) nécessitaient ce tri explicite.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { judge, type JudgeInput, type JudgeResult } from "../src/core/judge.js";
import { loadReferentiel } from "../src/core/referentiel.js";
import { RANGS_ORDONNES, type AxeId, type Evidence, type Force, type Polarite, type Rang, type SourceId } from "../src/core/types.js";
import { TOY_AXES, TOY_OFFICIAL_MARCHES, TOY_OWNERSHIP_MARCHES, TOY_REFERENTIEL, toyPathId } from "./toy-referentiel.js";

const NUM_RUNS = 500;

const SOURCES: readonly SourceId[] = ["GA", "PR", "RC", "S", "SO", "DEC"];
const FORCES: readonly Force[] = ["prouve", "indice"];
const POLARITES: readonly Polarite[] = ["preuve", "contre-preuve"];
const OFFICIAL_AXES: readonly AxeId[] = ["T", "H", "I", "P"];

function marchesFor(axe: AxeId): readonly string[] {
  return axe === "O" ? TOY_OWNERSHIP_MARCHES : TOY_OFFICIAL_MARCHES[axe as Exclude<AxeId, "O">];
}

const AXE_MARCHE_KEYS: readonly string[] = TOY_AXES.flatMap((axe) => marchesFor(axe).map((marcheId) => `${axe}:${marcheId}`));

function rangIndex(rang: Rang | null): number {
  return rang === null ? -1 : RANGS_ORDONNES.indexOf(rang);
}

function marcheIndex(axe: AxeId, marcheId: string | null): number {
  if (marcheId === null) return -1;
  return marchesFor(axe).indexOf(marcheId);
}

function axisOf(result: JudgeResult, axe: AxeId) {
  const found = result.axes.find((a) => a.axe === axe);
  if (!found) throw new Error(`axe ${axe} absent du résultat`);
  return found;
}

// ---------------------------------------------------------------------------
// Preuve que le référentiel jouet valide contre le schéma Zod strict réel
// (`src/core/referentiel.ts`, `RootSchema`, non exporté — on passe donc par le
// même chemin que `src/referentiel.json` : écrire puis `loadReferentiel()`).
// ---------------------------------------------------------------------------

describe("référentiel jouet — conformité au schéma", () => {
  test("TOY_REFERENTIEL valide le schéma Zod strict de core/referentiel.ts (via loadReferentiel sur un fichier temporaire)", () => {
    const dir = mkdtempSync(join(tmpdir(), "recognaize-toy-referentiel-"));
    const filePath = join(dir, "toy-referentiel.json");
    try {
      writeFileSync(filePath, JSON.stringify(TOY_REFERENTIEL, null, 2), "utf8");
      expect(() => loadReferentiel(filePath)).not.toThrow();
      const { referentiel } = loadReferentiel(filePath);
      expect(referentiel.axes.map((axis) => axis.id).sort()).toEqual(["H", "I", "O", "P", "T"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Générateurs fast-check
// ---------------------------------------------------------------------------

/** Générateur générique — toutes polarités, toutes sources, sources potentiellement en désaccord par marche (utilisé par les propriétés qui doivent tenir SANS restriction : permutation, idempotence, plafond/infirmé, bornes de fourchette, rabais Ownership). */
const generalEvidencePlanArb = fc.record({
  key: fc.constantFrom(...AXE_MARCHE_KEYS),
  source: fc.constantFrom(...SOURCES),
  polarite: fc.constantFrom(...POLARITES),
  force: fc.constantFrom(...FORCES),
  hasCitation: fc.boolean(),
});

function buildEvidenceArray(
  plans: readonly { key: string; source: SourceId; polarite: Polarite; force: Force; hasCitation: boolean }[],
): Evidence[] {
  return plans.map((plan, index) => {
    const [axe, marcheId] = plan.key.split(":") as [AxeId, string];
    return {
      id: `prop-ev-${index}`,
      signal_id: `TOY.${marcheId.toLowerCase()}_signal`,
      valeur: { type: "number", unite: "unite_jouet" },
      source: plan.source,
      check_id: "toy.synthetic",
      path_id: toyPathId(marcheId),
      concept_id: `concept-${marcheId}`,
      axe,
      polarite: plan.polarite,
      force: plan.force,
      confiance_source: TOY_REFERENTIEL.confiance_source[plan.source],
      ...(plan.hasCitation ? { citation: `citation-${index}-${plan.source}-${plan.polarite}` } : {}),
    };
  });
}

const generalEvidenceArrayArb = fc.array(generalEvidencePlanArb, { minLength: 0, maxLength: 14 }).map(buildEvidenceArray);

const referenceSourcesArb = fc.subarray([...SOURCES]).map((arr) => new Set(arr) as ReadonlySet<SourceId>);

interface GeneralScenario {
  readonly evidence: readonly Evidence[];
  readonly hasAiUsageProof: boolean;
  readonly referenceSourcesPresentes: ReadonlySet<SourceId>;
}

const generalScenarioArb: fc.Arbitrary<GeneralScenario> = fc.record({
  evidence: generalEvidenceArrayArb,
  hasAiUsageProof: fc.boolean(),
  referenceSourcesPresentes: referenceSourcesArb,
});

function inputFor(scenario: GeneralScenario, evidenceOverride?: readonly Evidence[]): JudgeInput {
  return {
    referentiel: TOY_REFERENTIEL,
    evidence: evidenceOverride ?? scenario.evidence,
    hasAiUsageProof: scenario.hasAiUsageProof,
    referenceSourcesPresentes: scenario.referenceSourcesPresentes,
  };
}

/**
 * Générateur restreint pour la monotonie (voir judgment call n°1 en tête de
 * fichier) : une seule source « canonique » par (axe, marche) pour tout le
 * scénario, et uniquement des `Evidence` de polarité `preuve`.
 */
const canonicalSourceByKeyArb = fc.dictionary(fc.constantFrom(...AXE_MARCHE_KEYS), fc.constantFrom(...SOURCES));

const monotonicPlanArb = fc.record({
  key: fc.constantFrom(...AXE_MARCHE_KEYS),
  force: fc.constantFrom(...FORCES),
  hasCitation: fc.boolean(),
});

interface MonotonicScenario {
  readonly plans: readonly { key: string; force: Force; hasCitation: boolean }[];
  readonly canonicalSourceByKey: Readonly<Record<string, SourceId>>;
  readonly hasAiUsageProof: boolean;
  readonly referenceSourcesPresentes: ReadonlySet<SourceId>;
}

const monotonicScenarioArb: fc.Arbitrary<MonotonicScenario> = fc.record({
  plans: fc.array(monotonicPlanArb, { minLength: 1, maxLength: 12 }),
  canonicalSourceByKey: canonicalSourceByKeyArb,
  hasAiUsageProof: fc.boolean(),
  referenceSourcesPresentes: referenceSourcesArb,
});

function buildMonotonicEvidence(scenario: MonotonicScenario): Evidence[] {
  return scenario.plans.map((plan, index) => {
    const [axe, marcheId] = plan.key.split(":") as [AxeId, string];
    const source = scenario.canonicalSourceByKey[plan.key] ?? "GA";
    return {
      id: `mono-ev-${index}`,
      signal_id: `TOY.${marcheId.toLowerCase()}_signal`,
      valeur: { type: "number", unite: "unite_jouet" },
      source,
      check_id: "toy.synthetic",
      path_id: toyPathId(marcheId),
      concept_id: `concept-${marcheId}`,
      axe,
      polarite: "preuve",
      force: plan.force,
      confiance_source: TOY_REFERENTIEL.confiance_source[source],
      ...(plan.hasCitation ? { citation: `citation-mono-${index}` } : {}),
    } satisfies Evidence;
  });
}

// ---------------------------------------------------------------------------
// Propriété 1 — Monotonie (restreinte, voir judgment call n°1)
// ---------------------------------------------------------------------------

describe("propriétés du juge (fast-check, référentiel jouet)", () => {
  test("monotonie : retirer une Evidence de preuve (source unique par marche) ne fait jamais monter le rang ponctuel ni la confiance", () => {
    fc.assert(
      fc.property(monotonicScenarioArb, fc.nat(), (scenario, removalSeed) => {
        const evidence = buildMonotonicEvidence(scenario);
        if (evidence.length === 0) return true;
        const removeIndex = removalSeed % evidence.length;
        const reduced = evidence.filter((_, index) => index !== removeIndex);

        const inputBase: Omit<JudgeInput, "evidence"> = {
          referentiel: TOY_REFERENTIEL,
          hasAiUsageProof: scenario.hasAiUsageProof,
          referenceSourcesPresentes: scenario.referenceSourcesPresentes,
        };
        const full = judge({ ...inputBase, evidence });
        const less = judge({ ...inputBase, evidence: reduced });

        expect(rangIndex(less.rang_ponctuel)).toBeLessThanOrEqual(rangIndex(full.rang_ponctuel));
        expect(less.confiance_globale).toBeLessThanOrEqual(full.confiance_globale);

        for (const axe of OFFICIAL_AXES) {
          const axisFull = axisOf(full, axe);
          const axisLess = axisOf(less, axe);
          expect(marcheIndex(axe, axisLess.niveau_ponctuel)).toBeLessThanOrEqual(marcheIndex(axe, axisFull.niveau_ponctuel));
          expect(axisLess.confiance).toBeLessThanOrEqual(axisFull.confiance);
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Propriété 2 — Invariance par permutation
  // -------------------------------------------------------------------------

  test("invariance par permutation : l'ordre des Evidence ne change jamais rang, fourchette, confiance, axes, ownership ni verdicts", () => {
    fc.assert(
      fc.property(
        generalScenarioArb.chain((scenario) =>
          fc.tuple(
            fc.constant(scenario),
            fc.shuffledSubarray([...scenario.evidence], { minLength: scenario.evidence.length, maxLength: scenario.evidence.length }),
          ),
        ),
        ([scenario, shuffled]) => {
          const original = judge(inputFor(scenario));
          const permuted = judge(inputFor(scenario, shuffled));
          expect(permuted).toEqual(original);
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Propriété 3 — Idempotence
  // -------------------------------------------------------------------------

  test("idempotence : appeler judge() deux fois sur la même entrée donne un résultat identique", () => {
    fc.assert(
      fc.property(generalScenarioArb, (scenario) => {
        const first = judge(inputFor(scenario));
        const second = judge(inputFor(scenario));
        expect(second).toEqual(first);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Propriété 4 — Aucune marche prouvée au-dessus d'une infirmée
  // -------------------------------------------------------------------------

  // NB : la marche déterminante ici est `niveau_prouve` / `niveau_ponctuel`
  // (le NIVEAU AGRÉGÉ retenu par le juge), pas le tableau brut `etats` : une
  // `Evidence` isolée « prouvé » au-dessus d'une marche infirmée PEUT
  // apparaître telle quelle dans `etats` (voir le scénario « I4 infirmée +
  // preuve isolée sur I5 » dans `judge.unit.test.ts`) ;
  // le juge la neutralise en plafonnant `niveau_prouve`/`niveau_ponctuel`
  // strictement EN DESSOUS de la marche infirmée, jamais en filtrant `etats`
  // lui-même (qui reste un compte-rendu brut, marche par marche). C'est cette
  // règle de plafonnement — la vraie garantie « jamais au-delà d'une marche
  // infirmée » — que cette propriété vérifie.
  test("le niveau agrégé (prouvé/ponctuel) ne dépasse jamais une marche « infirmé » sur le même axe", () => {
    fc.assert(
      fc.property(generalScenarioArb, (scenario) => {
        const result = judge(inputFor(scenario));
        if (result.status === "indeterminate") return true;

        for (const axe of OFFICIAL_AXES) {
          const axis = axisOf(result, axe);
          const firstInfirmeIndex = axis.etats.findIndex((e) => e.etat === "infirmé");
          if (firstInfirmeIndex === -1) continue;
          expect(marcheIndex(axe, axis.niveau_prouve)).toBeLessThan(firstInfirmeIndex);
          expect(marcheIndex(axe, axis.niveau_ponctuel)).toBeLessThan(firstInfirmeIndex);
        }

        const firstOwnershipInfirmeIndex = result.ownership.etats.findIndex((e) => e.etat === "infirmé");
        if (firstOwnershipInfirmeIndex !== -1) {
          expect(marcheIndex("O", result.ownership.niveau_prouve)).toBeLessThan(firstOwnershipInfirmeIndex);
          expect(marcheIndex("O", result.ownership.niveau_ponctuel)).toBeLessThan(firstOwnershipInfirmeIndex);
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Propriété 5 — rang_prouvé ≤ rang_ponctuel ≤ fourchette.haut
  // -------------------------------------------------------------------------

  test("rang_prouvé ≤ rang_ponctuel ≤ fourchette.haut, toujours", () => {
    fc.assert(
      fc.property(generalScenarioArb, (scenario) => {
        const result = judge(inputFor(scenario));
        if (result.status === "indeterminate") {
          expect(result.rang_prouve).toBeNull();
          expect(result.rang_ponctuel).toBeNull();
          expect(result.fourchette).toEqual({ bas: "white", haut: "gold" });
          return true;
        }
        expect(result.rang_prouve).not.toBeNull();
        expect(result.rang_ponctuel).not.toBeNull();
        expect(rangIndex(result.rang_prouve)).toBeLessThanOrEqual(rangIndex(result.rang_ponctuel));
        expect(rangIndex(result.rang_ponctuel)).toBeLessThanOrEqual(rangIndex(result.fourchette.haut));
        expect(rangIndex(result.fourchette.bas)).toBeLessThanOrEqual(rangIndex(result.fourchette.haut));
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Propriété 6 — Rabais Ownership ≤ 1 (référentiel jouet non-bloquant, comme le référentiel réel)
  // -------------------------------------------------------------------------

  test("rabais Ownership : jamais plus d'un cran d'écart entre rang_ponctuel et rang_affiche", () => {
    fc.assert(
      fc.property(generalScenarioArb, (scenario) => {
        const result = judge(inputFor(scenario));
        if (result.status === "indeterminate") return true;

        const delta = rangIndex(result.rang_ponctuel) - rangIndex(result.rang_affiche);
        expect(delta).toBeGreaterThanOrEqual(0); // jamais un rang affiché AU-DESSUS du rang ponctuel officiel
        expect(delta).toBeLessThanOrEqual(1); // TOY_REFERENTIEL.ownership.blocking === false ⇒ au plus un cran (DEC-003)
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
