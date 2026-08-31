// Juge générique. Ce fichier construit son `Evidence[]` à la main pour
// prouver la mécanique du juge — priorité des états, interpolation, ligne de
// montée, confiance, rabais Ownership — indépendamment de tout check réel.
// Les property tests sur référentiel jouet (fast-check, `test/judge.properties.test.ts`)
// sont hors périmètre ici : ces tests-ci sont directs et nommés, un par règle
// du juge.
//
// Utilise le référentiel réel (`loadReferentiel()`) uniquement comme source de
// `path_id` valides — jamais un check réel, jamais src/checks/**.

import { describe, expect, test } from "vitest";

import { judge, type JudgeResult } from "../src/core/judge.js";
import { loadReferentiel } from "../src/core/referentiel.js";
import type { AxeId, Evidence, Force, Polarite, SourceId } from "../src/core/types.js";

const { referentiel } = loadReferentiel();

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

function axisOf(result: JudgeResult, axe: AxeId) {
  const found = result.axes.find((a) => a.axe === axe);
  if (!found) throw new Error(`axe ${axe} absent du résultat`);
  return found;
}

function etatOf(result: JudgeResult, axe: AxeId, marche: string) {
  const found = axisOf(result, axe).etats.find((e) => e.marche === marche);
  return found?.etat;
}

// ---------------------------------------------------------------------------
// Tâche 1 — priorité des 6 états
// ---------------------------------------------------------------------------

describe("juge — priorité des états", () => {
  test("une marche avec preuve, indice ET contre-preuve (même source) résout à « infirmé »", () => {
    const evidence = [
      ev({ path_id: "T2.p1", axe: "T", force: "prouve", polarite: "preuve" }),
      ev({ path_id: "T2.p3", axe: "T", force: "indice", polarite: "preuve" }),
      ev({ path_id: "T2.p2", axe: "T", polarite: "contre-preuve" }),
    ];
    const result = judge({ referentiel, evidence, hasAiUsageProof: true });
    expect(etatOf(result, "T", "T2")).toBe("infirmé");
  });

  test("« compris » n'est jamais produit par le juge, quelle que soit l'entrée", () => {
    const evidence = copperEvidence();
    const result = judge({ referentiel, evidence, hasAiUsageProof: true });
    const tousLesEtats = result.axes.flatMap((axe) => axe.etats.map((e) => e.etat));
    expect(tousLesEtats).not.toContain("compris");
  });

  test("contradiction inter-sources : la source de plus haute précédence (RC > GA) l'emporte, et la contradiction est rapportée", () => {
    const evidence = [
      ev({ path_id: "H2.p2", axe: "H", source: "GA", polarite: "preuve", force: "prouve" }),
      ev({ path_id: "H2.p1", axe: "H", source: "RC", polarite: "contre-preuve" }),
    ];
    const result = judge({ referentiel, evidence, hasAiUsageProof: true });
    expect(etatOf(result, "H", "H2")).toBe("infirmé"); // RC (contre-preuve) bat GA (preuve)
    expect(result.incoherences.some((line) => line.includes("H2"))).toBe(true);
  });

  test("une contre-preuve DEC seule ne peut jamais infirmer une marche (le déclaratif n'a aucun poids)", () => {
    const evidence = [ev({ path_id: "T2.p1", axe: "T", source: "DEC", polarite: "contre-preuve" })];
    const result = judge({ referentiel, evidence, hasAiUsageProof: true });
    expect(etatOf(result, "T", "T2")).toBe("déclaré");
  });

  test("SU (indice de setup) ne peut jamais écraser une preuve GA en désaccord — précédence SU sous GA/PR/S", () => {
    // SU est positionnée sous GA/PR/S dans SOURCE_PRECEDENCE précisément pour qu'un simple
    // artefact de setup (jamais forcément utilisé) ne puisse jamais dégrader un axe déjà
    // prouvé par du comportement réellement observé (GA) vers "indice".
    const evidence = [
      ev({ path_id: "T2.p1", axe: "T", source: "GA", polarite: "preuve", force: "prouve" }),
      ev({ path_id: "T2.p4", axe: "T", source: "SU", polarite: "contre-preuve" }),
    ];
    const result = judge({ referentiel, evidence, hasAiUsageProof: true });
    expect(etatOf(result, "T", "T2")).toBe("prouvé"); // GA gagne, SU n'a pas voix face à une preuve "prouve"
  });

  test("SU seule (aucune autre source) comble un « inconnu » par un « indice », jamais un « prouvé »", () => {
    const evidence = [ev({ path_id: "I2.p3", axe: "I", source: "SU", polarite: "preuve", force: "indice" })];
    const result = judge({ referentiel, evidence, hasAiUsageProof: true });
    expect(etatOf(result, "I", "I2")).toBe("indice");
  });
});

// ---------------------------------------------------------------------------
// Tâche 4 — niveaux, interpolation, jamais d'extrapolation
// ---------------------------------------------------------------------------

describe("juge — niveaux prouvé / ponctuel / plafond", () => {
  test("T1 prouvé (défaut), T2 inconnu, T3 indice, T4 inconnu → prouvé=T1, ponctuel=T3, plafond=T4, T4 non extrapolée", () => {
    const evidence = [ev({ path_id: "T3.p3", axe: "T", force: "indice", polarite: "preuve" })];
    const result = judge({ referentiel, evidence, hasAiUsageProof: true });
    const axisT = axisOf(result, "T");
    expect(axisT.niveau_prouve).toBe("T1");
    expect(axisT.niveau_ponctuel).toBe("T3");
    expect(axisT.plafond_potentiel).toBe("T4");
    expect(etatOf(result, "T", "T2")).toBe("inconnu");
    expect(etatOf(result, "T", "T4")).toBe("inconnu");
  });

  test("I4 infirmée + preuve isolée sur I5 au-dessus → niveau plafonné à I3, avertissement « données incohérentes »", () => {
    const evidence = [
      ev({ path_id: "I2.p1", axe: "I" }),
      ev({ path_id: "I3.p1", axe: "I" }),
      ev({ path_id: "I4.p1", axe: "I", polarite: "contre-preuve" }),
      ev({ path_id: "I5.p1", axe: "I", source: "PR" }),
    ];
    const result = judge({ referentiel, evidence, hasAiUsageProof: true });
    const axisI = axisOf(result, "I");
    expect(axisI.niveau_prouve).toBe("I3");
    expect(axisI.niveau_ponctuel).toBe("I3");
    expect(axisI.plafond_potentiel).toBe("I3");
    expect(etatOf(result, "I", "I4")).toBe("infirmé");
    expect(etatOf(result, "I", "I5")).toBe("prouvé"); // affichée comme telle, mais sans effet sur le niveau
    expect(result.warnings.some((w) => w.toLowerCase().includes("données incohérentes"))).toBe(true);
  });

  test("passer une marche de « inconnue » à « déclarée » ne change jamais aucun rang (point ni fourchette)", () => {
    const baseline = [
      ev({ path_id: "T2.p1", axe: "T" }),
      ev({ path_id: "H2.p2", axe: "H" }),
      ev({ path_id: "H3.p2", axe: "H" }),
      ev({ path_id: "I2.p1", axe: "I" }),
    ];
    const before = judge({ referentiel, evidence: baseline, hasAiUsageProof: true });
    expect(etatOf(before, "T", "T3")).toBe("inconnu");

    const after = judge({
      referentiel,
      evidence: [...baseline, ev({ path_id: "T3.p1", axe: "T", source: "DEC", polarite: "preuve", force: "prouve" })],
      hasAiUsageProof: true,
    });
    expect(etatOf(after, "T", "T3")).toBe("déclaré");

    expect(after.rang_prouve).toBe(before.rang_prouve);
    expect(after.rang_ponctuel).toBe(before.rang_ponctuel);
    expect(after.rang_affiche).toBe(before.rang_affiche);
    expect(after.fourchette).toEqual(before.fourchette);
  });

  test("règle 2 — source de référence présente et axe muet ⇒ contre-preuve à la frontière (jamais si la source est absente)", () => {
    const withPresentSource = judge({
      referentiel,
      evidence: [],
      hasAiUsageProof: true,
      referenceSourcesPresentes: new Set<SourceId>(["GA"]), // T.reference_source = ["GA","PR"]
    });
    expect(etatOf(withPresentSource, "T", "T2")).toBe("infirmé");

    const withoutPresentSource = judge({ referentiel, evidence: [], hasAiUsageProof: true });
    expect(etatOf(withoutPresentSource, "T", "T2")).toBe("inconnu");
  });
});

// ---------------------------------------------------------------------------
// Tâche 5 — statut indéterminé
// ---------------------------------------------------------------------------

describe("juge — statut indéterminé (aucune preuve d'usage de l'IA)", () => {
  test("hasAiUsageProof=false ⇒ status indeterminate, fourchette White–Gold, confiance 0, quelle que soit l'Evidence fournie", () => {
    const result = judge({ referentiel, evidence: copperEvidence(), hasAiUsageProof: false });
    expect(result.status).toBe("indeterminate");
    expect(result.rang_prouve).toBeNull();
    expect(result.rang_ponctuel).toBeNull();
    expect(result.rang_affiche).toBeNull();
    expect(result.fourchette).toEqual({ bas: "white", haut: "gold" });
    expect(result.confiance_globale).toBe(0);
  });

  test("hasAiUsageProof=true et Evidence vide ⇒ ne lève jamais, rang_prouve au moins Red (les 4 défauts sont prouvés)", () => {
    expect(() => judge({ referentiel, evidence: [], hasAiUsageProof: true })).not.toThrow();
    const result = judge({ referentiel, evidence: [], hasAiUsageProof: true });
    expect(result.status).toBe("ok");
    expect(result.rang_prouve).toBe("red");
  });
});

// ---------------------------------------------------------------------------
// Tâche 6 — confiance
// ---------------------------------------------------------------------------

describe("juge — confiance", () => {
  test("axe sans aucune source ⇒ confiance 0, axe « non observé », et confiance globale = min des 4 axes = 0", () => {
    const evidence = [
      ev({ path_id: "T2.p1", axe: "T" }),
      ev({ path_id: "T2.p2", axe: "T" }),
      ev({ path_id: "I2.p1", axe: "I" }),
      ev({ path_id: "P2.p1", axe: "P" }),
      // Axe H : aucune Evidence du tout.
    ];
    const result = judge({ referentiel, evidence, hasAiUsageProof: true });
    const axisH = axisOf(result, "H");
    expect(axisH.confiance).toBe(0);
    expect(axisH.observe).toBe(false);
    expect(axisOf(result, "T").confiance).toBeGreaterThan(0); // preuve que le minimum tire réellement le global vers 0
    expect(result.confiance_globale).toBe(0);
  });

  test("confiance toujours dans [0 ; 1], arrondie à deux décimales", () => {
    const result = judge({ referentiel, evidence: copperEvidence(), hasAiUsageProof: true });
    for (const axis of result.axes) {
      expect(axis.confiance).toBeGreaterThanOrEqual(0);
      expect(axis.confiance).toBeLessThanOrEqual(1);
      expect(axis.confiance).toBe(Math.round(axis.confiance * 100) / 100);
    }
    expect(result.confiance_globale).toBeGreaterThanOrEqual(0);
    expect(result.confiance_globale).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Tâche 7 — Ownership (DEC-003)
// ---------------------------------------------------------------------------

describe("juge — rabais Ownership (DEC-003)", () => {
  test("rang officiel Copper + Ownership prouvé Red ⇒ rang affiché Green, mention explicite", () => {
    const result = judge({
      referentiel,
      evidence: copperEvidence(),
      hasAiUsageProof: true,
      referenceSourcesPresentes: new Set<SourceId>(["GA"]), // Ownership.reference_source = ["GA","RC"] : GA présent ⇒ O1 se seed
    });
    expect(result.rang_ponctuel).toBe("copper");
    expect(result.ownership.niveau_prouve).toBe("O1");
    expect(result.rang_affiche).toBe("green");
    expect(result.ownership.rabais_applique).toBe(true);
    expect(result.ownership.mention).toBe("abaissé d'un cran : Ownership");
  });

  test("même scénario (rang officiel Copper), Ownership inconnu ⇒ aucun rabais", () => {
    const result = judge({
      referentiel,
      evidence: copperEvidence(),
      hasAiUsageProof: true,
      // referenceSourcesPresentes omis ⇒ GA/RC non marquées présentes pour Ownership ⇒ O1 non seedée ⇒ inconnu.
    });
    expect(result.rang_ponctuel).toBe("copper");
    expect(result.ownership.niveau_prouve).toBeNull();
    expect(result.rang_affiche).toBe("copper");
    expect(result.ownership.rabais_applique).toBe(false);
    expect(result.ownership.mention).toBeUndefined();
  });

  test("Ownership établi par indice seul (jamais prouvé) ⇒ aucun rabais", () => {
    const result = judge({
      referentiel,
      evidence: [...copperEvidence(), ev({ path_id: "O2.p2", axe: "O", source: "PR", force: "indice" })],
      hasAiUsageProof: true,
    });
    expect(result.ownership.niveau_prouve).toBeNull(); // O2.p2 est un indice, jamais compté par niveau_prouve
    expect(result.ownership.rabais_applique).toBe(false);
  });

  test("referentiel.ownership.blocking=true ⇒ Ownership plafonne directement le rang affiché (pas seulement -1 cran)", () => {
    const blockingReferentiel = { ...referentiel, ownership: { ...referentiel.ownership, blocking: true } };
    const result = judge({
      referentiel: blockingReferentiel,
      evidence: [...copperEvidence(), ev({ path_id: "O2.p1", axe: "O" })], // O2 prouvé ⇒ Ownership = "blue"
      hasAiUsageProof: true,
    });
    expect(result.rang_ponctuel).toBe("copper");
    expect(result.rang_affiche).toBe("blue");
    expect(result.ownership.rabais_applique).toBe(true);
    expect(result.ownership.mention).toContain("bloquant");
  });
});

