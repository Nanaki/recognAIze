/**
 * Référentiel jouet pour les property tests. Structurellement
 * conforme au schéma Zod strict de `src/core/referentiel.ts` (`RootSchema`) —
 * `test/judge.properties.test.ts` le prouve en l'écrivant dans un fichier
 * temporaire et en le rechargeant via `loadReferentiel()`, exactement le même
 * chemin de validation que `src/referentiel.json` — mais entièrement
 * indépendant en contenu : aucune valeur, aucun `signal_id`, aucun `path_id`
 * n'est copié de la vraie grille à 24 marches. Ce fichier n'importe ni
 * `src/referentiel.json` ni rien sous `src/checks/**`.
 *
 * Choix de taille :
 * - **3 marches par axe officiel** (`<axe>1` défaut, `<axe>2`, `<axe>3`) sur
 *   les 4 axes officiels (T, H, I, P) et sur Ownership (O) — juste assez de
 *   marches pour exercer l'interpolation, l'infirmation et le plafond du juge
 *   sans reproduire la grille réelle à 24 marches.
 * - **Échelle (`ladder`) à 3 paliers utiles** : `red` (les 4 marches « défaut »,
 *   acquises dès `hasAiUsageProof`), `blue` (les 4 marches d'index 1), `green`
 *   (les 4 marches d'index 2, le sommet du jouet). Le schéma de
 *   `referentiel.ts` (`LadderSchema`, `.strict()`) exige les 6 clés de rang
 *   (`red`..`gold`) sans exception ; `copper`/`silver`/`gold` sont donc
 *   délibérément des ALIAS de `green` (même liste de marches) — ils ne
 *   représentent aucun palier supplémentaire dans ce jouet, seulement ce que le
 *   schéma strict impose structurellement. « Une échelle sur 2 rangs » (énoncé
 *   de la tâche) se lit ici comme la transition testée en priorité par les
 *   propriétés : `red → blue` (marches par défaut → marches prouvées) ; `green`
 *   (et ses alias) sert aux scénarios d'infirmation/plafond au-delà de `blue`.
 * - Ownership (O1..O3) suit le même mapping que le juge réel
 *   (`OWNERSHIP_RANG_BY_INDEX` dans `src/core/judge.ts`) : O1→red, O2→blue,
 *   O3→green — juste assez de marches pour exercer le rabais Ownership
 *   (propriété 6) sans viser l'exactitude du mapping réel (5 marches).
 *
 * Chaque marche non-défaut porte UN SEUL `proof_path` (`<marche>.p1`) — la
 * couverture multi-chemins (ex. T2 à 3 chemins dans la vraie grille) est déjà
 * prouvée par `test/judge.unit.test.ts` ; elle n'apporte rien de plus aux
 * propriétés testées ici. Les `thresholds` associés ne sont jamais évalués par
 * `judge()` : leur contenu est arbitraire, seule leur PRÉSENCE compte pour
 * satisfaire le schéma strict
 * (`validateNonDefaultMarchesHaveProofPathsAndThresholds`).
 */

import type { AxeId, Rang } from "../src/core/types.js";
import type { Referentiel } from "../src/core/referentiel.js";

/** Les 3 marches de chaque axe officiel, dans l'ordre — utilisé par les générateurs fast-check. */
export const TOY_OFFICIAL_MARCHES: Readonly<Record<Exclude<AxeId, "O">, readonly string[]>> = {
  T: ["T1", "T2", "T3"],
  H: ["H1", "H2", "H3"],
  I: ["I1", "I2", "I3"],
  P: ["P1", "P2", "P3"],
};

/** Les 3 marches Ownership, dans l'ordre. */
export const TOY_OWNERSHIP_MARCHES: readonly string[] = ["O1", "O2", "O3"];

/** Tous les axes du jouet (officiels + Ownership), pour les générateurs. */
export const TOY_AXES: readonly AxeId[] = ["T", "H", "I", "P", "O"];

/** `path_id` de chaque marche du jouet (un seul par marche, y compris les marches défaut — jamais déclaré côté défaut, mais utile aux générateurs qui n'ont pas besoin de le savoir). */
export function toyPathId(marcheId: string): string {
  return `${marcheId}.p1`;
}

/** Rang de la grille jouet correspondant à chaque index de marche officielle (0→red, 1→blue, 2→green — cohérent avec `TOY_REFERENTIEL.ladder`). */
export const TOY_RANG_BY_INDEX: readonly Rang[] = ["red", "blue", "green"];

function officialMarche(id: string, index: number): Referentiel["axes"][number]["marches"][number] {
  if (index === 0) {
    return { id, label: `${id} (défaut)`, default: true, proof_paths: [], counter_proof: null };
  }
  const pathId = toyPathId(id);
  return {
    id,
    label: `${id} (jouet)`,
    default: false,
    proof_paths: [
      {
        path_id: pathId,
        description: `Preuve jouet de ${id}`,
        force: "prouve",
        signal_id: `TOY.${id.toLowerCase()}_signal`,
        source: "GA",
      },
    ],
    counter_proof: { description: `Contre-preuve jouet de ${id}`, signal_id: `TOY.${id.toLowerCase()}_signal` },
  };
}

function officialAxis(id: Exclude<AxeId, "O">, referenceSource: Referentiel["axes"][number]["reference_source"]): Referentiel["axes"][number] {
  return {
    id,
    label: `Axe jouet ${id}`,
    reference_source: referenceSource,
    marches: TOY_OFFICIAL_MARCHES[id].map((marcheId, index) => officialMarche(marcheId, index)),
  };
}

const ownershipAxis: Referentiel["axes"][number] = {
  id: "O",
  label: "Ownership jouet",
  reference_source: ["GA"],
  marches: TOY_OWNERSHIP_MARCHES.map((marcheId, index) => officialMarche(marcheId, index)),
};

const officialMarcheIds = Object.values(TOY_OFFICIAL_MARCHES).flat();

/** Un seuil "condition" arbitraire par `path_id` non-défaut (jamais évalué par `judge()` — seule la présence compte). */
const thresholds: Referentiel["thresholds"] = Object.fromEntries(
  [...officialMarcheIds, ...TOY_OWNERSHIP_MARCHES]
    .filter((marcheId) => !marcheId.endsWith("1")) // les marches défaut (T1/H1/I1/P1/O1) n'ont pas de proof_path.
    .map((marcheId) => [
      toyPathId(marcheId),
      {
        kind: "condition" as const,
        signal_id: `TOY.${marcheId.toLowerCase()}_signal`,
        comparator: "gte" as const,
        value: 1,
        value_type: "number" as const,
      },
    ]),
);

const redMarches = ["T1", "H1", "I1", "P1"];
const blueMarches = ["T2", "H2", "I2", "P2"];
const greenMarches = ["T3", "H3", "I3", "P3"];

/**
 * Référentiel jouet complet, structurellement conforme au schéma Zod strict de
 * `src/core/referentiel.ts` (prouvé par un test dédié dans
 * `judge.properties.test.ts`). Contenu entièrement indépendant de
 * `src/referentiel.json`.
 */
export const TOY_REFERENTIEL: Referentiel = {
  schema_version: "toy-1.0.0",
  axes: [
    officialAxis("T", ["GA", "PR"]),
    officialAxis("H", ["GA"]),
    officialAxis("I", ["PR"]),
    officialAxis("P", ["GA"]),
    ownershipAxis,
  ],
  thresholds,
  ladder: {
    red: redMarches,
    blue: blueMarches,
    // `copper`/`silver`/`gold` : alias de `green`, imposés par le schéma strict
    // (6 clés obligatoires) — voir la note en tête de fichier. Le jouet n'a pas
    // de palier distinct au-delà de `green` (3 marches par axe seulement).
    green: greenMarches,
    copper: greenMarches,
    silver: greenMarches,
    gold: greenMarches,
  },
  ownership: { blocking: false, marches: [...TOY_OWNERSHIP_MARCHES] },
  confiance_source: { GA: 1, RC: 0.95, PR: 0.85, SO: 0.75, S: 0.55, SU: 0.25, DEC: 0 },
  source_precedence: ["RC", "PR", "GA", "SO", "S", "SU", "DEC"],
};
