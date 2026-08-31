/**
 * Prochaine marche par axe. À partir de l'état déjà jugé d'un axe
 * (`AxisJudgement.etats`, `core/judge.ts`), trouve la première marche NON
 * prouvée (la plus basse en index) : sa description et son lien de fiche
 * (`src/referentiel/concepts.json`), et ses chemins de preuve, pour que la
 * personne sache exactement quoi apporter ensuite. Un axe déjà au maximum
 * (toutes les marches connues à l'état « prouvé ») rend « au sommet de cet
 * axe » plutôt qu'une marche.
 *
 * PUR par construction — même posture que `src/report/html.ts` : aucune E/S,
 * aucune horloge. `loadConcepts` (I/O, lecture de `concepts.json`) est un
 * utilitaire co-localisé dans ce même fichier plutôt qu'un module séparé —
 * même précédent que `src/report/json.ts`.`readToolVersion`, qui vit à côté de
 * la fonction pure `buildResultDocument` qu'il alimente.
 *
 * Seuls les 4 axes officiels (T, H, I, P) ont une « ligne de montée » au sens
 * de la grille level-up — Ownership (`O`) reste « affiché, hors ligne de
 * montée » (spec, DEC-003). `computeNextStep` accepte n'importe quel `AxeId`
 * en entrée (y compris `"O"`, testable isolément) mais `src/cli.ts`/
 * `src/report/html.ts` ne l'appellent que pour T/H/I/P — Ownership garde sa
 * propre section (`renderOwnershipSection`), jamais de bloc « prochaine
 * marche » pour lui.
 *
 * `computeNextStep` reste sciemment SANS accès aux `Evidence` (seul
 * `AxisJudgement.etats`, déjà résolu par le juge, est nécessaire) — la
 * fonction reste pure et testable avec seulement un référentiel jouet, sans
 * construire de preuves synthétiques. `manque` liste donc TOUJOURS
 * l'intégralité des chemins de preuve déclarés de la marche trouvée (jamais un
 * sous-ensemble filtré par preuve déjà observée) : l'appelant (`report/html.ts`)
 * est libre d'habiller cette liste selon l'état (« infirmée » vs « inconnue »)
 * sans que cette fonction ait à re-dériver une logique déjà portée par
 * `core/judge.ts`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { Referentiel } from "../core/referentiel.js";
import type { AxeId, Etat, EtatMarche, Force, SourceId } from "../core/types.js";

// ---------------------------------------------------------------------------
// concepts.json — chargement et validation
// ---------------------------------------------------------------------------

/**
 * Une entrée de `concepts.json` : description originale + lien de fiche,
 * jamais de contenu recopié du brainstorm/spec.
 *
 * `lien` est une ancre SUR LA MÊME PAGE (`#concept-<marche>`) — jamais un
 * chemin vers `docs/referentiel.md`, qui n'existe jamais sous
 * `recognaize-cli-out/<sujet>/`, où `report.html` est réellement écrit (un tel
 * lien serait donc toujours mort). `detail` (régénéré par
 * `scripts/gen-concept-details.ts` depuis `docs/referentiel.md`) porte le
 * texte complet de la marche — `src/report/html.ts` le rend dans une section
 * d'annexe portant cette même ancre, éliminant toute dépendance à un fichier
 * externe au dossier de sortie.
 */
export interface ConceptEntry {
  readonly marche: string;
  readonly description: string;
  readonly detail: string;
  readonly lien: string;
}

export type ConceptsIndex = ReadonlyMap<string, ConceptEntry>;

const ConceptEntrySchema = z
  .object({
    marche: z.string().regex(/^[A-Z]\d+$/),
    description: z.string().min(1),
    detail: z.string().min(1),
    lien: z.string().min(1),
  })
  .strict();

const ConceptsFileSchema = z.array(ConceptEntrySchema);

/** Erreur de démarrage : `concepts.json` est absent, illisible ou invalide — même posture que `ReferentielInvalideError`. */
export class ConceptsInvalideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConceptsInvalideError";
  }
}

/** Résolu relativement à ce module (donc à `dist/report/next-step.js` une fois construit, `src/referentiel/` copié tel quel par `scripts/build-assets.mjs`). */
function resolveConceptsPath(): string {
  return fileURLToPath(new URL("../referentiel/concepts.json", import.meta.url));
}

/**
 * Charge et valide `concepts.json` en un index par identifiant de marche.
 * Lève {@link ConceptsInvalideError} si le fichier est absent, illisible ou
 * ne respecte pas le schéma strict — jamais un index tronqué silencieux.
 */
export function loadConcepts(filePath: string = resolveConceptsPath()): ConceptsIndex {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ConceptsInvalideError(`concepts.json introuvable ou illisible (${filePath}) : ${detail}`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ConceptsInvalideError(`concepts.json invalide (${filePath}) : ${detail}`);
  }

  const result = ConceptsFileSchema.safeParse(parsedJson);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  - ${issue.path.join(".")} : ${issue.message}`);
    throw new ConceptsInvalideError(`concepts.json invalide (${filePath}) :\n${lines.join("\n")}`);
  }

  const index = new Map<string, ConceptEntry>();
  for (const entry of result.data) {
    index.set(entry.marche, entry);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Prochaine marche par axe
// ---------------------------------------------------------------------------

/** Un chemin de preuve manquant, tel que décrit par le référentiel — jamais une valeur observée (cette fonction n'a pas d'`Evidence`). */
export interface ManqueItem {
  readonly path_id: string;
  readonly description: string;
  readonly force: Force;
  readonly signal_id: string;
  readonly source: SourceId;
}

export type NextStepKind = "prochaine-marche" | "sommet" | "indetermine";

export interface NextStep {
  readonly axe: AxeId;
  readonly kind: NextStepKind;
  readonly marche?: string;
  readonly label?: string;
  readonly etat?: Etat;
  readonly description?: string;
  readonly lien?: string;
  readonly manque: readonly ManqueItem[];
}

/**
 * Première marche NON prouvée de l'axe (index le plus bas dans
 * `axis.marches`, cohérent avec `AxisJudgement.etats` qui suit déjà cet
 * ordre — voir `core/judge.ts`.`computeAxis`, `for (const marche of
 * marches)`). Sans marche non prouvée ⇒ « au sommet de cet axe ». Aucune
 * marche du tout (`etats` vide, seul cas réel : `JudgeResult.status ===
 * "indeterminate"`, `core/judge.ts`.`indeterminateResult`) ⇒ `"indetermine"`,
 * jamais confondu avec « au sommet ».
 */
export function computeNextStep(
  axeId: AxeId,
  axis: Referentiel["axes"][number],
  etats: readonly EtatMarche[],
  concepts: ConceptsIndex,
): NextStep {
  if (etats.length === 0) {
    return { axe: axeId, kind: "indetermine", manque: [] };
  }

  const firstUnproven = etats.find((entry) => entry.etat !== "prouvé");
  if (!firstUnproven) {
    return { axe: axeId, kind: "sommet", manque: [] };
  }

  const marcheDef = axis.marches.find((marche) => marche.id === firstUnproven.marche);
  const concept = concepts.get(firstUnproven.marche);
  const manque: readonly ManqueItem[] = marcheDef
    ? marcheDef.proof_paths.map((proofPath) => ({
        path_id: proofPath.path_id,
        description: proofPath.description,
        force: proofPath.force,
        signal_id: proofPath.signal_id,
        source: proofPath.source,
      }))
    : [];

  return {
    axe: axeId,
    kind: "prochaine-marche",
    marche: firstUnproven.marche,
    label: marcheDef?.label,
    etat: firstUnproven.etat,
    description: concept?.description,
    lien: concept?.lien,
    manque,
  };
}
