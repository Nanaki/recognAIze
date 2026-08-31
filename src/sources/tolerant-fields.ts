/**
 * Utilitaires de validation tolérante partagés par les adaptateurs de pièces
 * chiffrées (`git-activity.ts`, `pull-requests.ts`, `sonar.ts`). Chaque
 * validateur rend soit la valeur typée, soit `undefined` — il ne lève JAMAIS.
 * Un champ ABSENT du JSON source (`raw[key] === undefined`) rend `undefined`
 * en silence (tolérance normale d'un schéma `.passthrough().partial()`) ;
 * c'est à l'appelant, qui connaît la présence ou non de la clé brute, de
 * décider s'il faut pousser un `ProfileWarning` — un champ PRÉSENT mais mal
 * typé ou hors bornes en produit un, un champ ABSENT jamais (voir
 * `extractField`/`extractSection` dans `git-activity.ts`, seuls points d'appel
 * qui poussent réellement les avertissements).
 *
 * Contrat commun (`.claude/rules/fiabilite.md`) : chaque adaptateur rend
 * `{ok:true, data, warnings}` (même partiel) ou `{ok:false, warning}`
 * uniquement quand la pièce entière est illisible.
 */

import type { ProfileWarning } from "../core/types.js";

export type SourceResult<T> =
  | { readonly ok: true; readonly data: T; readonly warnings: readonly ProfileWarning[] }
  | { readonly ok: false; readonly warning: ProfileWarning };

/** Avertissement « champ précis invalide » — `field` est un chemin pointé (`pull_requests.total`). */
export function fieldWarning(file: string, field: string, cause: string): ProfileWarning {
  return { code: "invalid_field", file, cause: `champ '${field}' invalide (${cause}) — ignoré.` };
}

/** Avertissement générique (JSON invalide, forme top-level non reconnue, etc.). */
export function pieceWarning(file: string, code: string, cause: string): ProfileWarning {
  return { code, file, cause };
}

/** Représentation compacte d'une valeur brute pour un message d'avertissement lisible. */
export function describeRaw(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) {
      return String(value);
    }
    return json.length > 80 ? `${json.slice(0, 80)}…` : json;
  } catch {
    return String(value);
  }
}

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `undefined` si `raw` n'est pas un nombre fini (couvre `NaN`/`Infinity`, jamais propagés). */
export function parseFiniteNumber(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export function parseNonNegativeNumber(raw: unknown): number | undefined {
  const n = parseFiniteNumber(raw);
  return n !== undefined && n >= 0 ? n : undefined;
}

export function parseNonNegativeInteger(raw: unknown): number | undefined {
  const n = parseNonNegativeNumber(raw);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}

/** Ratio dans `[0;1]` — hors bornes ⇒ `undefined` (ratio hors `[0;1]` ⇒ inconnu). */
export function parseRatio01(raw: unknown): number | undefined {
  const n = parseFiniteNumber(raw);
  return n !== undefined && n >= 0 && n <= 1 ? n : undefined;
}

export function parseBooleanField(raw: unknown): boolean | undefined {
  return typeof raw === "boolean" ? raw : undefined;
}

export function parseNonEmptyString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/** `null` est une valeur valide distincte de « absent » (ex. `context_files.last_updated: null`). */
export function parseStringOrNull(raw: unknown): string | null | undefined {
  if (raw === null) {
    return null;
  }
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

export function parseStringArray(raw: unknown): readonly string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.every((item) => typeof item === "string") ? (raw as readonly string[]) : undefined;
}

/**
 * Timestamp UTC (ms) à partir d'une chaîne ISO (date seule ou date-heure). Ne
 * dépend d'aucun fuseau ambiant : `Date.parse` sur une chaîne ISO qualifiée
 * (`Z`/offset, ou date seule — traitée UTC par la spec ECMA-262) est
 * déterministe quelle que soit la machine.
 */
export function parseIsoTimestamp(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return undefined;
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

export function median(values: readonly number[]): { readonly status: "ok"; readonly value: number } | { readonly status: "unknown"; readonly reason: string } {
  if (values.length === 0) {
    return { status: "unknown", reason: "dénominateur nul" };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  if (!Number.isFinite(value)) {
    return { status: "unknown", reason: "valeur non finie" };
  }
  return { status: "ok", value };
}

export function isDefinedNumber(value: number | undefined): value is number {
  return value !== undefined;
}
