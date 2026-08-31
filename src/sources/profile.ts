/**
 * Adaptateur pour `profile.json`. Lit `profile_id`, `stack`, `available`
 * tolérant au champ près (même convention que `git-activity.ts` : champ
 * ABSENT ⇒ silence, champ PRÉSENT mais mal typé ⇒ `undefined` + avertissement
 * nommé, voir `tolerant-fields.ts`).
 *
 * `available` de `profile.json` n'est PAS fiable sur parole — la comparaison
 * avec ce qui existe RÉELLEMENT sur disque doit se faire quelque part avec
 * accès aux deux informations. Plutôt qu'un orchestrateur séparé, ce module
 * réutilise directement `listPieces` de `src/core/profileFolder.ts`, qui liste
 * déjà la présence des 8 pièces connues sur disque (et sert au même usage dans
 * `cli.ts`). Aucune duplication de logique de présence, aucun nouvel
 * orchestrateur nécessaire : l'incohérence est détectée ICI, dans l'adaptateur
 * qui a déjà les deux informations sous la main (le contenu qu'il vient de
 * parser, et `profileDirAbs` qu'il a déjà reçu).
 */

import { join } from "node:path";

import { listPieces, type KnownPieceName } from "../core/profileFolder.js";
import type { ProfileWarning } from "../core/types.js";
import { readBoundedText } from "./read.js";
import {
  describeRaw,
  describeError,
  fieldWarning,
  isPlainObject,
  parseNonEmptyString,
  parseStringArray,
  pieceWarning,
  type SourceResult,
} from "./tolerant-fields.js";

export const PROFILE_FILE = "profile.json";

export interface ProfileIncoherence {
  readonly piece: KnownPieceName;
  readonly declaredAvailable: boolean;
  readonly actuallyPresent: boolean;
}

export interface ProfileData {
  readonly profileId?: string;
  readonly stack: readonly string[];
  /** `undefined` si le champ est absent du JSON (tolérance normale — rien à comparer, aucune incohérence possible). */
  readonly available?: readonly string[];
  readonly incoherences: readonly ProfileIncoherence[];
}

export type ProfileResult = SourceResult<ProfileData>;

/** `profile.json` déclare `"code/"` et `"repo-context/"` avec un `/` final (4 fixtures réelles) — `KNOWN_PIECE_NAMES` non. */
function stripTrailingSlash(name: string): string {
  return name.endsWith("/") ? name.slice(0, -1) : name;
}

export function loadProfile(profileDirAbs: string): ProfileResult {
  const filePath = join(profileDirAbs, PROFILE_FILE);
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
      warning: pieceWarning(PROFILE_FILE, "invalid_json", `JSON invalide : ${describeError(err)}`),
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      warning: pieceWarning(
        PROFILE_FILE,
        "not_object",
        `contenu top-level attendu objet, reçu ${describeRaw(parsed)}`,
      ),
    };
  }

  const warnings: ProfileWarning[] = [];
  const raw = parsed;

  let profileId: string | undefined;
  if ("profile_id" in raw && raw["profile_id"] !== undefined) {
    const value = parseNonEmptyString(raw["profile_id"]);
    if (value === undefined) {
      warnings.push(fieldWarning(PROFILE_FILE, "profile_id", `reçu ${describeRaw(raw["profile_id"])}`));
    } else {
      profileId = value;
    }
  }

  let stack: readonly string[] = [];
  if ("stack" in raw && raw["stack"] !== undefined) {
    const value = parseStringArray(raw["stack"]);
    if (value === undefined) {
      warnings.push(fieldWarning(PROFILE_FILE, "stack", `reçu ${describeRaw(raw["stack"])}`));
    } else {
      stack = value;
    }
  }

  let available: readonly string[] | undefined;
  if ("available" in raw && raw["available"] !== undefined) {
    const value = parseStringArray(raw["available"]);
    if (value === undefined) {
      warnings.push(fieldWarning(PROFILE_FILE, "available", `reçu ${describeRaw(raw["available"])}`));
    } else {
      available = value;
    }
  }

  const incoherences: ProfileIncoherence[] = [];
  if (available !== undefined) {
    const declared = new Set(available.map(stripTrailingSlash));
    for (const piece of listPieces(profileDirAbs)) {
      if (piece.name === PROFILE_FILE) {
        // `profile.json` ne se déclare jamais lui-même dans `available` (vérifié
        // sur les 4 fixtures réelles) — s'auto-comparer produirait un faux positif.
        continue;
      }
      const declaredAvailable = declared.has(piece.name);
      if (declaredAvailable !== piece.present) {
        incoherences.push({ piece: piece.name, declaredAvailable, actuallyPresent: piece.present });
        warnings.push(
          pieceWarning(
            PROFILE_FILE,
            "available_incoherent",
            `'available' déclare '${piece.name}' ${declaredAvailable ? "présent" : "absent"} ` +
              `alors qu'il est ${piece.present ? "présent" : "absent"} sur disque — pièce lue quand même.`,
          ),
        );
      }
    }
  }

  return { ok: true, data: { profileId, stack, available, incoherences }, warnings };
}
