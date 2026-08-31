/**
 * Adaptateur pour `sonar-measures.json`. Forme d'entrée :
 * `component.measures[]`, un tableau de `{metric, value}` où `value` est le
 * plus souvent une CHAÎNE (`"85.0"`), jamais un nombre brut — confirmé sur les
 * 4 fixtures réelles (`fixtures/profiles/{bohort,arthur,leodagan,perceval}/sonar-measures.json`).
 *
 * SEUL endroit de tout le dépôt où la conversion 0-100 → 0-1 de `coverage` et
 * `duplicated_lines_density` a lieu — ne JAMAIS dupliquer cette normalisation
 * ailleurs. `bugs` est normalisé en compte entier. Un métrique absent de
 * `measures[]` ⇒ « non évalué » pour ce critère précis : le champ
 * correspondant est simplement `undefined`, sans avertissement (absent ≠
 * invalide, même convention que `git-activity.ts`).
 *
 * `branch_coverage` est, dans l'API Sonar, un pourcentage au même titre que
 * `coverage`, mais reste ici volontairement rendu tel quel après parsing
 * chaîne→nombre, SANS division par 100, pour respecter « seul endroit du
 * dépôt » pour la conversion 0-100 → 0-1 de `coverage`/`duplicated_lines_density`
 * précisément — à revisiter explicitement si un futur check consomme ce champ
 * en ratio.
 */

import { join } from "node:path";

import type { ProfileWarning } from "../core/types.js";
import { readBoundedText } from "./read.js";
import {
  describeError,
  describeRaw,
  fieldWarning,
  isPlainObject,
  parseNonEmptyString,
  pieceWarning,
  type SourceResult,
} from "./tolerant-fields.js";

export const SONAR_MEASURES_FILE = "sonar-measures.json";

export interface SonarMeasures {
  readonly ncloc?: number;
  readonly files?: number;
  /** Ratio `[0;1]` — normalisé depuis un pourcentage Sonar `[0;100]`. */
  readonly duplicated_lines_density?: number;
  readonly complexity?: number;
  readonly cognitive_complexity?: number;
  /** Ratio `[0;1]` — normalisé depuis un pourcentage Sonar `[0;100]`. */
  readonly coverage?: number;
  /** Échelle Sonar brute `[0;100]`, NON normalisée ici — voir la docstring en tête de fichier. */
  readonly branch_coverage?: number;
  readonly tests?: number;
  readonly uncovered_files?: number;
  readonly code_smells?: number;
  readonly bugs?: number;
  readonly sqale_index?: number;
}

export interface SonarData {
  readonly componentKey?: string;
  readonly componentName?: string;
  readonly language?: string;
  readonly analysedAt?: string;
  readonly measures: SonarMeasures;
}

export type SonarResult = SourceResult<SonarData>;

/** Sonar rend `value` en chaîne dans la quasi-totalité des cas ; accepte aussi un nombre brut par tolérance. */
function parseNumericValue(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : undefined;
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function indexMeasures(measures: readonly unknown[]): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const entry of measures) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const metric = entry["metric"];
    if (typeof metric !== "string" || metric.length === 0 || !("value" in entry)) {
      continue;
    }
    if (!map.has(metric)) {
      map.set(metric, entry["value"]);
    }
  }
  return map;
}

/**
 * Un métrique absent de `measures[]` ⇒ `undefined` en silence (« non évalué »,
 * pas d'avertissement). Un métrique présent mais dont la valeur n'est ni un
 * nombre fini ni convertible, OU dont le résultat de `postProcess` est hors
 * bornes (ex. pourcentage hors `[0;100]`), ⇒ `undefined` + avertissement nommé.
 */
function extractMetric(
  index: Map<string, unknown>,
  metric: string,
  file: string,
  warnings: ProfileWarning[],
  postProcess: (n: number) => number | undefined = (n) => n,
): number | undefined {
  if (!index.has(metric)) {
    return undefined;
  }
  const raw = index.get(metric);
  const n = parseNumericValue(raw);
  if (n === undefined) {
    warnings.push(fieldWarning(file, `component.measures[${metric}]`, `valeur non numérique, reçu ${describeRaw(raw)}`));
    return undefined;
  }
  const result = postProcess(n);
  if (result === undefined) {
    warnings.push(fieldWarning(file, `component.measures[${metric}]`, `valeur hors bornes : ${n}`));
    return undefined;
  }
  return result;
}

function toRatioFromPercent(n: number): number | undefined {
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return undefined;
  }
  const ratio = n / 100;
  return Number.isFinite(ratio) ? ratio : undefined;
}

function toNonNegativeInteger(n: number): number | undefined {
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function toNonNegativePercent(n: number): number | undefined {
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
}

export function loadSonarMeasures(profileDirAbs: string): SonarResult {
  const filePath = join(profileDirAbs, SONAR_MEASURES_FILE);
  const read = readBoundedText(profileDirAbs, filePath);
  if (!read.ok) {
    return { ok: false, warning: read.warning };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(read.data);
  } catch (err) {
    return {
      ok: false,
      warning: pieceWarning(SONAR_MEASURES_FILE, "invalid_json", `JSON invalide : ${describeError(err)}`),
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      warning: pieceWarning(
        SONAR_MEASURES_FILE,
        "not_object",
        `contenu top-level attendu objet, reçu ${describeRaw(parsed)}`,
      ),
    };
  }

  const component = parsed["component"];
  if (!isPlainObject(component)) {
    return {
      ok: false,
      warning: pieceWarning(
        SONAR_MEASURES_FILE,
        "not_object",
        `'component' attendu objet, reçu ${describeRaw(component)}`,
      ),
    };
  }

  const measuresRaw = component["measures"];
  if (!Array.isArray(measuresRaw)) {
    return {
      ok: false,
      warning: pieceWarning(
        SONAR_MEASURES_FILE,
        "not_object",
        `'component.measures' attendu tableau, reçu ${describeRaw(measuresRaw)}`,
      ),
    };
  }

  const warnings: ProfileWarning[] = [];
  const file = SONAR_MEASURES_FILE;
  const index = indexMeasures(measuresRaw);

  const measures: SonarMeasures = {
    ncloc: extractMetric(index, "ncloc", file, warnings, toNonNegativeInteger),
    files: extractMetric(index, "files", file, warnings, toNonNegativeInteger),
    duplicated_lines_density: extractMetric(index, "duplicated_lines_density", file, warnings, toRatioFromPercent),
    complexity: extractMetric(index, "complexity", file, warnings, toNonNegativeInteger),
    cognitive_complexity: extractMetric(index, "cognitive_complexity", file, warnings, toNonNegativeInteger),
    coverage: extractMetric(index, "coverage", file, warnings, toRatioFromPercent),
    branch_coverage: extractMetric(index, "branch_coverage", file, warnings, toNonNegativePercent),
    tests: extractMetric(index, "tests", file, warnings, toNonNegativeInteger),
    uncovered_files: extractMetric(index, "uncovered_files", file, warnings, toNonNegativeInteger),
    code_smells: extractMetric(index, "code_smells", file, warnings, toNonNegativeInteger),
    bugs: extractMetric(index, "bugs", file, warnings, toNonNegativeInteger),
    sqale_index: extractMetric(index, "sqale_index", file, warnings, toNonNegativeInteger),
  };

  const componentKey = parseNonEmptyString(component["key"]);
  const componentName = parseNonEmptyString(component["name"]);
  const language = parseNonEmptyString(component["language"]);
  const analysedAt = parseNonEmptyString(parsed["analysedAt"]);

  return {
    ok: true,
    data: { componentKey, componentName, language, analysedAt, measures },
    warnings,
  };
}
