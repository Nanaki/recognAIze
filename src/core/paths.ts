// Résolution de chemins et assainissement d'identifiants — voir
// .claude/rules/fiabilite.md : « identifiant de profil assaini avant tout chemin de
// sortie » et « jamais d'écriture dans le dossier analysé ».

import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { UsageError } from "./errors.js";

const DEFAULT_OUT_DIR = "./recognaize-cli-out";
const MAX_SLUG_LENGTH = 40;
const HASH_LENGTH = 8;

/**
 * URL du `referentiel.json` livré avec l'outil, résolue relativement à ce
 * module (donc à `dist/core/paths.js` une fois construit — `build:assets`
 * copie `src/referentiel.json` dans `dist/`).
 */
export function resolveReferentielUrl(): URL {
  return new URL("../referentiel.json", import.meta.url);
}

/** Chemin filesystem du référentiel, dérivé de {@link resolveReferentielUrl}. */
export function resolveReferentielPath(): string {
  return fileURLToPath(resolveReferentielUrl());
}

/**
 * Transforme un `profile_id` arbitraire et non fiable (peut contenir `../`, des
 * séparateurs de chemin, des caractères non ASCII, être vide…) en un slug ASCII sûr,
 * suffixé d'un court hash déterministe, utilisable comme unique segment de chemin
 * sous `--out`. Ne permet jamais de traversée de chemin : tout caractère hors
 * `[a-zA-Z0-9]` est réduit à un tiret avant toute utilisation comme chemin.
 */
export function sanitizeSubject(profileId: string): string {
  const normalized = profileId.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const asciiSlug = normalized
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const slug = asciiSlug.length > 0 ? asciiSlug.slice(0, MAX_SLUG_LENGTH) : "sujet";
  const hash = createHash("sha256").update(profileId, "utf8").digest("hex").slice(0, HASH_LENGTH);
  return `${slug}-${hash}`;
}

function isInsideOrEqual(childAbs: string, parentAbs: string): boolean {
  if (childAbs === parentAbs) {
    return true;
  }
  const rel = relative(parentAbs, childAbs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Résout le répertoire de sortie final `<out>/<sujet assaini>` pour un sujet donné.
 * Refuse (exit 3 via {@link UsageError}) si le `--out` résolu se trouve à l'intérieur
 * du dossier analysé (ou lui est identique), afin de garantir qu'on n'écrit jamais
 * dans le dossier analysé.
 */
export function resolveSubjectOutputDir(
  outOption: string | undefined,
  analyzedPath: string,
  sanitizedSubject: string,
): string {
  const outBase = resolve(outOption ?? DEFAULT_OUT_DIR);
  const analyzedAbs = resolve(analyzedPath);

  if (isInsideOrEqual(outBase, analyzedAbs)) {
    throw new UsageError(
      `--out (${outBase}) ne peut pas être à l'intérieur du dossier analysé (${analyzedAbs}) — ` +
        "rien ne doit jamais être écrit dans le dossier analysé.",
    );
  }

  return resolve(outBase, sanitizedSubject);
}
