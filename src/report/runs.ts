/**
 * Historique des exécutions (`runs/<horodatage>.json`) et delta vs la
 * précédente exécution comparable, pour le MÊME sujet et le MÊME
 * `schema_version` (« Deux exécutions consécutives donnent des `result.json`
 * identiques hors horodatage »).
 *
 * Volontairement séparé du `result.json` lui-même : le delta référence la
 * PRÉCÉDENTE exécution, donc y figurer romprait le déterminisme de
 * `result.json` (le 2ᵉ run d'une paire consécutive aurait un delta, le 1ᵉʳ
 * non — deux `result.json` du même sujet, à la même entrée, ne seraient plus
 * identiques). Écrit à la place dans `runs/<horodatage>.delta.json`, un
 * fichier séparé, hors du périmètre du test de déterminisme byte-à-byte.
 *
 * Le nom de fichier `runs/<horodatage>.json` utilise `new Date()` (jamais
 * `Date.now()`, banni sous `src/**` par `eslint.config.js` pour le
 * déterminisme de `result.json`) : ce nom sert uniquement de clé
 * d'archivage/tri, jamais une entrée du document déterministe lui-même — même
 * statut que le nom de fichier `runs/<horodatage>`, déjà exclu explicitement
 * de la comparaison golden.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { atomicWriteFileSync } from "./atomic-write.js";
import type { ResultDocument } from "./json.js";

const RUNS_DIRNAME = "runs";

/** Horodatage ASCII triable lexicographiquement, sûr comme segment de nom de fichier (`:`/`.` remplacés). */
function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function compareDesc(a: string, b: string): number {
  if (a < b) return 1;
  if (a > b) return -1;
  return 0;
}

interface PreviousRun {
  readonly filename: string;
  readonly document: ResultDocument;
}

/**
 * Cherche la plus récente exécution archivée dont le `schema_version` est
 * identique à `schemaVersion`. Un fichier illisible ou JSON tronqué/corrompu
 * est silencieusement ignoré (jamais de crash) — on continue avec le suivant
 * par ordre décroissant d'horodatage, plutôt que d'abandonner toute
 * comparaison au premier fichier corrompu rencontré.
 */
function findPreviousComparableRun(runsDir: string, schemaVersion: string): PreviousRun | undefined {
  if (!existsSync(runsDir)) return undefined;

  let filenames: string[];
  try {
    filenames = readdirSync(runsDir).filter((name) => name.endsWith(".json") && !name.endsWith(".delta.json"));
  } catch {
    return undefined;
  }
  filenames.sort(compareDesc);

  for (const filename of filenames) {
    try {
      const raw = readFileSync(join(runsDir, filename), "utf8");
      const parsed = JSON.parse(raw) as Partial<ResultDocument>;
      if (parsed.schema_version === schemaVersion) {
        return { filename, document: parsed as ResultDocument };
      }
    } catch {
      // Fichier tronqué/corrompu (écriture interrompue d'un run précédent) — ignoré pour le delta, jamais un crash.
      continue;
    }
  }
  return undefined;
}

interface FieldDelta<T> {
  readonly avant: T;
  readonly apres: T;
  readonly changed: boolean;
}

function fieldDelta<T>(avant: T, apres: T): FieldDelta<T> {
  return { avant, apres, changed: JSON.stringify(avant) !== JSON.stringify(apres) };
}

export interface AxisDelta {
  readonly axe: string;
  readonly niveau_ponctuel: FieldDelta<string | null>;
  readonly confiance: FieldDelta<number>;
}

export interface ResultDelta {
  readonly run_precedent: string;
  readonly rang_affiche: FieldDelta<string | null>;
  readonly rang_ponctuel: FieldDelta<string | null>;
  readonly fourchette: FieldDelta<ResultDocument["fourchette"]>;
  readonly confiance_globale: FieldDelta<number>;
  readonly axes: readonly AxisDelta[];
}

export type DeltaOutcome = { readonly status: "unknown"; readonly reason: string } | { readonly status: "ok"; readonly delta: ResultDelta };

/**
 * Compare deux `ResultDocument` du même sujet et du même `schema_version`
 * (garanti par l'appelant, {@link findPreviousComparableRun}) sur les champs
 * qui font la substance d'un « delta » de verdict : rang(s), fourchette,
 * confiance globale et par axe.
 */
function computeDelta(previous: ResultDocument, current: ResultDocument, previousFilename: string): ResultDelta {
  const axes: AxisDelta[] = current.axes.map((axisApres) => {
    const axisAvant = previous.axes.find((axis) => axis.axe === axisApres.axe);
    return {
      axe: axisApres.axe,
      niveau_ponctuel: fieldDelta(axisAvant?.niveau_ponctuel ?? null, axisApres.niveau_ponctuel),
      confiance: fieldDelta(axisAvant?.confiance ?? 0, axisApres.confiance),
    };
  });

  return {
    run_precedent: previousFilename,
    rang_affiche: fieldDelta(previous.rang_affiche, current.rang_affiche),
    rang_ponctuel: fieldDelta(previous.rang_ponctuel, current.rang_ponctuel),
    fourchette: fieldDelta(previous.fourchette, current.fourchette),
    confiance_globale: fieldDelta(previous.confiance_globale, current.confiance_globale),
    axes,
  };
}

export interface RunHistoryOutcome {
  readonly runFilename: string;
  readonly delta: DeltaOutcome;
}

/**
 * Archive `document` sous `<subjectOutputDir>/runs/<horodatage>.json` (écriture
 * atomique) et calcule le delta vs la précédente exécution comparable (même
 * sujet — implicite, `subjectOutputDir` en dépend déjà — et même
 * `schema_version`), écrit séparément sous `runs/<horodatage>.delta.json`.
 * Aucune trace de sujet ou de `schema_version` différents n'est jamais
 * comparée (delta calculé seulement entre exécutions du même sujet et du même
 * `schema_version`).
 */
export function writeRunHistory(subjectOutputDir: string, document: ResultDocument): RunHistoryOutcome {
  const runsDir = join(subjectOutputDir, RUNS_DIRNAME);
  const previous = findPreviousComparableRun(runsDir, document.schema_version);

  const timestamp = timestampForFilename();
  const runFilename = `${timestamp}.json`;
  const runPath = join(runsDir, runFilename);
  atomicWriteFileSync(runPath, `${JSON.stringify(document, null, 2)}\n`);

  const deltaOutcome: DeltaOutcome =
    previous === undefined
      ? { status: "unknown", reason: "aucune exécution précédente comparable (même sujet, même schema_version)." }
      : { status: "ok", delta: computeDelta(previous.document, document, previous.filename) };

  const deltaPath = join(runsDir, `${timestamp}.delta.json`);
  atomicWriteFileSync(deltaPath, `${JSON.stringify(deltaOutcome, null, 2)}\n`);

  return { runFilename, delta: deltaOutcome };
}
