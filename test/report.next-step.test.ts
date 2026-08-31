// `src/report/next-step.ts` : `loadConcepts`
// (chargement + validation de `src/referentiel/concepts.json`) et
// `computeNextStep` (première marche non prouvée d'un axe, ou « au sommet »,
// ou « indéterminé »).
//
// Deux niveaux de test, comme le reste de ce dépôt (`test/judge.unit.test.ts`) :
// - `computeNextStep` isolée sur `TOY_REFERENTIEL` (`test/toy-referentiel.ts`),
//   avec des `EtatMarche[]` synthétiques — jamais de dépendance à un profil réel ;
// - un scénario Blue construit avec `judge()` + le VRAI référentiel + des
//   `Evidence` synthétiques, pour l'AC « profil Blue avec H4 infirmée affiche
//   H4 comme prochaine marche Harness » (aucun des 4 étalons réels n'a cette
//   forme exacte — vérifié en lisant `fixtures/profiles/*` — donc un scénario
//   est construit à la place.

import { describe, expect, test } from "vitest";

import { judge } from "../src/core/judge.js";
import { loadReferentiel } from "../src/core/referentiel.js";
import type { Evidence } from "../src/core/types.js";
import { computeNextStep, loadConcepts } from "../src/report/next-step.js";
import { TOY_REFERENTIEL } from "./toy-referentiel.js";

const CONCEPTS = loadConcepts();

describe("loadConcepts : concepts.json couvre exactement les 24 marches du référentiel réel (AC)", () => {
  test("une entrée par marche, ni plus ni moins, chacune avec description, detail et lien", () => {
    const { referentiel } = loadReferentiel();
    const realMarcheIds = referentiel.axes.flatMap((axis) => axis.marches.map((marche) => marche.id));

    expect(realMarcheIds).toHaveLength(24);
    expect(CONCEPTS.size).toBe(24);

    for (const marcheId of realMarcheIds) {
      const entry = CONCEPTS.get(marcheId);
      expect(entry, `concepts.json devrait connaître ${marcheId}`).toBeDefined();
      expect(entry?.description.length).toBeGreaterThan(0);
      expect(entry?.detail.length).toBeGreaterThan(0);
      expect(entry?.lien.length).toBeGreaterThan(0);
      // Contrainte dure du HTML autonome : jamais de ressource http(s):// —
      // le lien de fiche doit rester un chemin relatif.
      expect(entry?.lien).not.toMatch(/^https?:\/\//);
      // `lien` est une ancre SUR LA MÊME PAGE que `report.html`
      // (`#concept-<marche>`), jamais un chemin vers un fichier externe au
      // dossier de sortie généré (`docs/referentiel.md` n'y est jamais copié) —
      // sinon le lien de la fiche est mort dans le HTML autonome.
      expect(entry?.lien).toBe(`#concept-${marcheId.toLowerCase()}`);
    }

    // Aucune entrée orpheline (marche inconnue du référentiel réel).
    for (const marcheId of CONCEPTS.keys()) {
      expect(realMarcheIds).toContain(marcheId);
    }
  });
});

describe("computeNextStep : jouet (TOY_REFERENTIEL)", () => {
  const axisH = TOY_REFERENTIEL.axes.find((axis) => axis.id === "H");
  if (!axisH) throw new Error("TOY_REFERENTIEL sans axe H — jouet invalide.");

  const toyConcepts = new Map(
    axisH.marches.map((marche) => [
      marche.id,
      { marche: marche.id, description: `desc ${marche.id}`, detail: `detail ${marche.id}`, lien: `lien/${marche.id}` },
    ]),
  );

  test("etats vide (statut indéterminé) ⇒ kind indetermine, jamais confondu avec sommet", () => {
    const result = computeNextStep("H", axisH, [], toyConcepts);
    expect(result.kind).toBe("indetermine");
    expect(result.marche).toBeUndefined();
    expect(result.manque).toEqual([]);
  });

  test("toutes les marches prouvées ⇒ kind sommet, « au sommet de cet axe »", () => {
    const etats = axisH.marches.map((marche) => ({ marche: marche.id, etat: "prouvé" as const }));
    const result = computeNextStep("H", axisH, etats, toyConcepts);
    expect(result.kind).toBe("sommet");
    expect(result.marche).toBeUndefined();
    expect(result.manque).toEqual([]);
  });

  test("première marche non prouvée (index le plus bas) ⇒ kind prochaine-marche, avec description/lien/manque", () => {
    // H1 (défaut) prouvé, H2 infirmé (la première non prouvée), H3 resterait indice.
    const etats = [
      { marche: "H1", etat: "prouvé" as const },
      { marche: "H2", etat: "infirmé" as const },
      { marche: "H3", etat: "indice" as const },
    ];
    const result = computeNextStep("H", axisH, etats, toyConcepts);
    expect(result.kind).toBe("prochaine-marche");
    expect(result.marche).toBe("H2");
    expect(result.etat).toBe("infirmé");
    expect(result.description).toBe("desc H2");
    expect(result.lien).toBe("lien/H2");
    const h2Def = axisH.marches.find((marche) => marche.id === "H2");
    expect(result.manque.map((item) => item.path_id)).toEqual(h2Def?.proof_paths.map((proofPath) => proofPath.path_id));
  });

  test("marche introuvable dans concepts ⇒ description/lien absents, jamais un crash", () => {
    const etats = [
      { marche: "H1", etat: "prouvé" as const },
      { marche: "H2", etat: "inconnu" as const },
    ];
    const result = computeNextStep("H", axisH, etats, new Map());
    expect(result.kind).toBe("prochaine-marche");
    expect(result.marche).toBe("H2");
    expect(result.description).toBeUndefined();
    expect(result.lien).toBeUndefined();
  });
});

describe("computeNextStep : profil Blue construit, H4 infirmée (AC)", () => {
  let idCounter = 0;
  function evidence(overrides: Partial<Evidence> & Pick<Evidence, "axe" | "path_id" | "source" | "polarite">): Evidence {
    idCounter += 1;
    return {
      id: `ev-${idCounter}`,
      signal_id: overrides.signal_id ?? "sig",
      valeur: { type: "boolean", unite: "bool" },
      force: "prouve",
      check_id: `${overrides.path_id}.check`,
      concept_id: overrides.path_id.split(".")[0] ?? overrides.path_id,
      confiance_source: 1,
      ...overrides,
    };
  }

  test("T2/H2/H3/I2 prouvés, H4 infirmée : rang_affiche = blue, prochaine marche Harness = H4", () => {
    const { referentiel } = loadReferentiel();

    const evidenceList: Evidence[] = [
      evidence({ axe: "T", path_id: "T2.p1", source: "GA", polarite: "preuve" }),
      evidence({ axe: "H", path_id: "H2.p1", source: "RC", polarite: "preuve" }),
      evidence({ axe: "H", path_id: "H3.p1", source: "RC", polarite: "preuve" }),
      evidence({ axe: "H", path_id: "H4.p1", source: "RC", polarite: "contre-preuve" }),
      evidence({ axe: "I", path_id: "I2.p1", source: "GA", polarite: "preuve" }),
    ];

    const result = judge({ referentiel, evidence: evidenceList, hasAiUsageProof: true });

    expect(result.rang_affiche).toBe("blue");

    const axisH = referentiel.axes.find((axis) => axis.id === "H");
    const axisHJudgement = result.axes.find((axis) => axis.axe === "H");
    if (!axisH || !axisHJudgement) throw new Error("axe H introuvable — référentiel réel invalide.");

    const nextStep = computeNextStep("H", axisH, axisHJudgement.etats, CONCEPTS);

    expect(nextStep.kind).toBe("prochaine-marche");
    expect(nextStep.marche).toBe("H4");
    expect(nextStep.etat).toBe("infirmé");
    expect(nextStep.label).toBe(axisH.marches.find((marche) => marche.id === "H4")?.label);
    expect(nextStep.description).toBe(CONCEPTS.get("H4")?.description);
    expect(nextStep.lien).toBe(CONCEPTS.get("H4")?.lien);
    expect(nextStep.manque.map((item) => item.path_id).sort()).toEqual(["H4.p1", "H4.p2"]);
  });
});
