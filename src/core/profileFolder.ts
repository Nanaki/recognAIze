// Détection du mode et des pièces d'un dossier de profil.
//
// Cette liste sert uniquement à décider si `analyze` a assez de matière pour
// ne pas refuser (exit 2), et à afficher la liste française des pièces
// manquantes. Elle ne contient aucun seuil de jugement (pas de calcul d'axe,
// pas de rang) — ceux-ci vivent dans `checks/` et `referentiel.json`, jamais
// ici (voir .claude/rules/fiabilite.md : « core/ n'importe jamais checks/ »).
//
// Les 8 pièces reconnues par le sujet (docs/references/laivel-up-profiles-README.md).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const KNOWN_PIECE_NAMES = [
  "profile.json",
  "git-activity.json",
  "pull-requests.json",
  "code",
  "sonar-measures.json",
  "repo-context",
  "declaratif.md",
  "session.md",
] as const;

export type KnownPieceName = (typeof KNOWN_PIECE_NAMES)[number];

export interface PieceCheck {
  readonly name: KnownPieceName;
  readonly present: boolean;
}

/** Présence de chacune des 8 pièces reconnues, à la racine du dossier de profil. */
export function listPieces(profilePath: string): PieceCheck[] {
  return KNOWN_PIECE_NAMES.map((name) => ({
    name,
    present: existsSync(join(profilePath, name)),
  }));
}

/** `true` si le dossier de profil contient un sous-dossier `.git`. */
export function hasGitDirectory(profilePath: string): boolean {
  return existsSync(join(profilePath, ".git"));
}

/** `true` si le dossier de profil ne contient strictement aucune entrée. */
export function isDirectoryEmpty(profilePath: string): boolean {
  return readdirSync(profilePath).length === 0;
}

/**
 * Dérive un identifiant de sujet : le champ `profile_id` de `profile.json` si
 * le fichier est présent, lisible et le porte ; sinon le nom du dossier
 * analysé. Une pièce absente ou illisible ne fait jamais planter cette
 * dérivation — elle retombe simplement sur le nom du dossier (« pièce
 * illisible = absente », fiabilite.md). Volontairement indépendante de la
 * validation complète de `profile.json` (schéma Zod, `sources/profile.ts`) :
 * ceci ne fait que repérer un identifiant pour nommer le chemin de sortie,
 * avant même de savoir si le profil est exploitable.
 */
export function deriveProvisionalSubjectId(profilePath: string, folderBasename: string): string {
  const profileJsonPath = join(profilePath, "profile.json");
  if (!existsSync(profileJsonPath)) {
    return folderBasename;
  }
  try {
    const raw = readFileSync(profileJsonPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && "profile_id" in parsed) {
      const value = (parsed as Record<string, unknown>).profile_id;
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  } catch {
    // JSON invalide, encodage, ou tout autre échec de lecture : pièce illisible =
    // absente ; on retombe sur le nom de dossier plutôt que de faire planter l'outil.
  }
  return folderBasename;
}
