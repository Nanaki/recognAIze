/**
 * Adaptateur pour `pull-requests.json`. Accepte un tableau bare OU
 * `{items: [...]}` (les deux formes existent : `bohort` et `leodagan`
 * livrent un tableau bare dans les fixtures réelles ; `{items}` couvre une
 * API de PR paginée). Déduplique par `number` (première occurrence gagnante,
 * avertissement sur les suivantes — ordre du fichier, déterministe). Seules
 * les entrées `merged: true` dont `merged_at` tombe dans la fenêtre d'analyse
 * (fournie par l'appelant, dérivée par `core/as-of.ts`) comptent pour les
 * médianes.
 *
 * Un tableau (ou `{items: []}`) VIDE est « présent mais muet » : `{ok:true,
 * data: {totalEntries:0, mergedInWindowCount:0, ...médianes "unknown"}}` —
 * distinct d'un fichier absent, qui rend `{ok:false}` (propagé depuis
 * `readBoundedText`). C'est une contre-preuve pour les axes Taille/Parallèle,
 * mais l'interprétation de cette contre-preuve est hors périmètre de cet
 * adaptateur (territoire du juge) — ce module se contente de rendre le fait
 * observable sans ambiguïté.
 *
 * Médiane calculée directement ici (liste de nombres, pas de buckets) —
 * volontairement PAS une dépendance vers `src/lib/median-from-buckets.ts`
 * (dédié aux distributions de taille par buckets uniquement).
 *
 * `body` (texte libre de la description de PR) est nécessaire à
 * `O3.pull-requests.ts` (`PR.structured_body_ratio`, référentiel `O3.p2`), qui
 * ne peut lire QUE `ProfileContext` (jamais son propre JSON —
 * `.claude/rules/fiabilite.md` : « un check ne connaît que ProfileContext et
 * le référentiel »). `structuredBodyRatio` est donc calculé ICI (pas dans le
 * check) : ratio, parmi les PR mergées dans la fenêtre dont le `body` est non
 * nul, de celles jugées « structurées » — au moins 2 indices parmi {en-tête
 * markdown, liste à puces, mot-clé contexte/changement, assez long}, même
 * style que `sources/repo-context.ts`.`computeSpecificity` (≥ 2 indices/4).
 * Dénominateur nul (aucun `body` non nul) ⇒ `{status:"unknown",
 * reason:"dénominateur nul"}`, jamais de `NaN`.
 */

import { join } from "node:path";

import type { AsOfWindow } from "../core/as-of.js";
import type { ProfileWarning } from "../core/types.js";
import { readBoundedText } from "./read.js";
import {
  describeError,
  describeRaw,
  isDefinedNumber,
  isPlainObject,
  median,
  parseBooleanField,
  parseFiniteNumber,
  parseIsoTimestamp,
  parseNonNegativeInteger,
  parseStringOrNull,
  pieceWarning,
  type SourceResult,
} from "./tolerant-fields.js";

export const PULL_REQUESTS_FILE = "pull-requests.json";

export type MedianResult =
  | { readonly status: "ok"; readonly value: number }
  | { readonly status: "unknown"; readonly reason: string };

export interface PullRequestsData {
  /** Nombre d'entrées valides après déduplication par `number` (avant filtre de fenêtre). */
  readonly totalEntries: number;
  /** Nombre d'entrées retenues : `merged: true` ET `merged_at` dans la fenêtre d'analyse. */
  readonly mergedInWindowCount: number;
  readonly medianChangedFiles: MedianResult;
  readonly medianLinesChanged: MedianResult;
  readonly medianReviewComments: MedianResult;
  readonly medianCreatedToMergedDays: MedianResult;
  /** Ratio de bodies « structurés » parmi les bodies non nuls des PR mergées dans la fenêtre — voir la docstring de tête de fichier. */
  readonly structuredBodyRatio: MedianResult;
}

export type PullRequestsResult = SourceResult<PullRequestsData>;

interface ParsedEntry {
  readonly number: number;
  readonly merged?: boolean;
  readonly mergedAtMs?: number;
  readonly createdAtMs?: number;
  readonly changedFiles?: number;
  readonly linesChanged?: number;
  readonly reviewComments?: number;
  /** `null` = présent mais explicitement vide (compte comme « body nul », exclu du dénominateur de `structuredBodyRatio`) ; `undefined` = absent ou invalide. */
  readonly body?: string | null;
}

const STRUCTURED_BODY_HEADING_RE = /^#{1,6}\s/m;
const STRUCTURED_BODY_BULLET_RE = /^[-*]\s/m;
const STRUCTURED_BODY_KEYWORD_RE = /\b(contexte|context|changement|change|résumé|summary)\b/i;
const STRUCTURED_BODY_MIN_LINES = 3;

/** Corps de PR « structuré » : au moins 2 indices parmi {en-tête markdown, liste à puces, mot-clé contexte/changement, assez de lignes} — même style que `repo-context.ts`.`computeSpecificity`. */
function isStructuredBody(body: string): boolean {
  let hints = 0;
  if (STRUCTURED_BODY_HEADING_RE.test(body)) hints += 1;
  if (STRUCTURED_BODY_BULLET_RE.test(body)) hints += 1;
  if (STRUCTURED_BODY_KEYWORD_RE.test(body)) hints += 1;
  if (body.split("\n").filter((line) => line.trim().length > 0).length >= STRUCTURED_BODY_MIN_LINES) hints += 1;
  return hints >= 2;
}

/** Ratio (parmi les bodies non nuls) jugés structurés — dénominateur nul ⇒ `unknown`, même contrat que `median()`. */
function structuredBodyRatioOf(entries: readonly ParsedEntry[]): MedianResult {
  const nonNullBodies = entries.map((e) => e.body).filter((b): b is string => typeof b === "string");
  if (nonNullBodies.length === 0) {
    return { status: "unknown", reason: "dénominateur nul" };
  }
  const structuredCount = nonNullBodies.filter(isStructuredBody).length;
  return { status: "ok", value: structuredCount / nonNullBodies.length };
}

function extractItems(parsed: unknown): readonly unknown[] | undefined {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isPlainObject(parsed) && Array.isArray(parsed["items"])) {
    return parsed["items"];
  }
  return undefined;
}

function extractPrField<T>(
  rawItem: Record<string, unknown>,
  key: string,
  parser: (raw: unknown) => T | undefined,
  prNumber: number,
  warnings: ProfileWarning[],
): T | undefined {
  if (!(key in rawItem) || rawItem[key] === undefined) {
    return undefined;
  }
  const value = parser(rawItem[key]);
  if (value === undefined) {
    warnings.push(
      pieceWarning(
        PULL_REQUESTS_FILE,
        "invalid_field",
        `PR #${prNumber} : champ '${key}' invalide (reçu ${describeRaw(rawItem[key])}) — ignoré.`,
      ),
    );
    return undefined;
  }
  return value;
}

/** `"YYYY-MM-DD"` UTC du timestamp — pour comparer à `AsOfWindow` à la granularité du jour (bornes incluses). */
function utcDateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function parseEntries(
  items: readonly unknown[],
  warnings: ProfileWarning[],
): readonly ParsedEntry[] {
  const seenNumbers = new Set<number>();
  const entries: ParsedEntry[] = [];

  items.forEach((rawItem, index) => {
    if (!isPlainObject(rawItem)) {
      warnings.push(
        pieceWarning(
          PULL_REQUESTS_FILE,
          "invalid_entry",
          `entrée #${index} ignorée : attendu objet, reçu ${describeRaw(rawItem)}`,
        ),
      );
      return;
    }

    const number = parseFiniteNumber(rawItem["number"]);
    if (number === undefined) {
      warnings.push(
        pieceWarning(
          PULL_REQUESTS_FILE,
          "invalid_entry",
          `entrée #${index} ignorée : champ 'number' absent ou invalide (reçu ${describeRaw(rawItem["number"])})`,
        ),
      );
      return;
    }
    if (seenNumbers.has(number)) {
      warnings.push(
        pieceWarning(
          PULL_REQUESTS_FILE,
          "duplicate_pr_number",
          `entrée dupliquée pour 'number' = ${number} — seule la première occurrence est retenue.`,
        ),
      );
      return;
    }
    seenNumbers.add(number);

    const merged = extractPrField(rawItem, "merged", parseBooleanField, number, warnings);

    let mergedAtMs: number | undefined;
    if (merged === true) {
      const rawMergedAt = rawItem["merged_at"];
      if (rawMergedAt === null || rawMergedAt === undefined) {
        warnings.push(
          pieceWarning(
            PULL_REQUESTS_FILE,
            "invalid_field",
            `PR #${number} : 'merged'=true mais 'merged_at' absent — exclue du calcul de fenêtre.`,
          ),
        );
      } else {
        const ms = parseIsoTimestamp(rawMergedAt);
        if (ms === undefined) {
          warnings.push(
            pieceWarning(
              PULL_REQUESTS_FILE,
              "invalid_field",
              `PR #${number} : 'merged_at' invalide (reçu ${describeRaw(rawMergedAt)}) — exclue du calcul de fenêtre.`,
            ),
          );
        } else {
          mergedAtMs = ms;
        }
      }
    }

    let createdAtMs: number | undefined;
    if ("created_at" in rawItem && rawItem["created_at"] !== undefined && rawItem["created_at"] !== null) {
      const ms = parseIsoTimestamp(rawItem["created_at"]);
      if (ms === undefined) {
        warnings.push(
          pieceWarning(
            PULL_REQUESTS_FILE,
            "invalid_field",
            `PR #${number} : 'created_at' invalide (reçu ${describeRaw(rawItem["created_at"])}) — ignoré.`,
          ),
        );
      } else {
        createdAtMs = ms;
      }
    }

    const changedFiles = extractPrField(rawItem, "changed_files", parseNonNegativeInteger, number, warnings);
    const additions = extractPrField(rawItem, "additions", parseNonNegativeInteger, number, warnings);
    const deletions = extractPrField(rawItem, "deletions", parseNonNegativeInteger, number, warnings);
    const reviewComments = extractPrField(rawItem, "review_comments", parseNonNegativeInteger, number, warnings);

    const linesChanged = additions !== undefined && deletions !== undefined ? additions + deletions : undefined;
    const body = extractPrField(rawItem, "body", parseStringOrNull, number, warnings);

    entries.push({ number, merged, mergedAtMs, createdAtMs, changedFiles, linesChanged, reviewComments, body });
  });

  return entries;
}

export function loadPullRequests(profileDirAbs: string, window: AsOfWindow): PullRequestsResult {
  const filePath = join(profileDirAbs, PULL_REQUESTS_FILE);
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
      warning: pieceWarning(PULL_REQUESTS_FILE, "invalid_json", `JSON invalide : ${describeError(err)}`),
    };
  }

  const items = extractItems(parsed);
  if (items === undefined) {
    return {
      ok: false,
      warning: pieceWarning(
        PULL_REQUESTS_FILE,
        "unrecognized_shape",
        `contenu top-level attendu tableau ou { items: [...] }, reçu ${describeRaw(parsed)}`,
      ),
    };
  }

  const warnings: ProfileWarning[] = [];
  const entries = parseEntries(items, warnings);

  const mergedInWindow = entries.filter((entry) => {
    if (entry.merged !== true || entry.mergedAtMs === undefined) {
      return false;
    }
    const mergedDate = utcDateOnly(entry.mergedAtMs);
    return mergedDate >= window.from && mergedDate <= window.to;
  });

  const medianChangedFiles = median(mergedInWindow.map((e) => e.changedFiles).filter(isDefinedNumber));
  const medianLinesChanged = median(mergedInWindow.map((e) => e.linesChanged).filter(isDefinedNumber));
  const medianReviewComments = median(mergedInWindow.map((e) => e.reviewComments).filter(isDefinedNumber));
  const medianCreatedToMergedDays = median(
    mergedInWindow
      .filter((e) => e.createdAtMs !== undefined && e.mergedAtMs !== undefined)
      .map((e) => (e.mergedAtMs! - e.createdAtMs!) / (24 * 60 * 60 * 1000)),
  );

  const structuredBodyRatio = structuredBodyRatioOf(mergedInWindow);

  return {
    ok: true,
    data: {
      totalEntries: entries.length,
      mergedInWindowCount: mergedInWindow.length,
      medianChangedFiles,
      medianLinesChanged,
      medianReviewComments,
      medianCreatedToMergedDays,
      structuredBodyRatio,
    },
    warnings,
  };
}
