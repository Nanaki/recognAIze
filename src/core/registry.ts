/**
 * Assemblage et isolation des checks (`.claude/rules/fiabilite.md` :
 * « core/ n'importe jamais checks/ »).
 *
 * Ce module ne connaît AUCUN check réel ni `src/checks/**` : il reçoit les checks
 * déjà assemblés — par `src/packs.ts`, qui n'est PAS sous `core/` et peut donc
 * importer `src/checks/index.ts` — et la liste des fichiers physiquement présents
 * sous `src/checks/**`, produite par ce même index généré. Toute la logique
 * ci-dessous reste ainsi testable avec des checks synthétiques
 * (`test/registry.test.ts`), sans jamais dépendre d'un fichier réel de `checks/`.
 */

import type { Referentiel } from "./referentiel.js";
import type { Check, Evidence, ProfileContext } from "./types.js";

/** Erreur de démarrage : un check cite un `path_id` inconnu, ou un fichier de `src/checks/**` n'appartient à aucun pack. */
export class RegistryInvalideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryInvalideError";
  }
}

/**
 * Un fichier physiquement présent sous `src/checks/<pack>/`, tel que rapporté par
 * l'index généré (`src/checks/index.ts`, produit par `scripts/gen-checks-index.ts`).
 * `checkId` est le `check_id` que ce fichier exporte — utilisé pour vérifier qu'il
 * appartient bien à l'un des checks assemblés dans `src/packs.ts`.
 */
export interface DiscoveredCheckFile {
  readonly file: string;
  readonly checkId: string;
}

/** Registre assemblé : checks triés déterministiquement, avertissements de couverture. */
export interface Registry {
  /** Checks triés `(axe, marche, sources, check_id)` par points de code — jamais `Intl`/`localeCompare`. */
  readonly checks: readonly Check[];
  /** Un avertissement par `path_id` du référentiel qu'aucun check du registre ne couvre. */
  readonly warnings: readonly string[];
}

/**
 * Comparaison de points de code Unicode, jamais `Intl`/`localeCompare` — seul
 * ordre de tri déterministe indépendant de la locale (`.claude/rules/fiabilite.md`).
 * Exportée pour réutilisation par `src/report/json.ts` (tri de `evidence[]`).
 */
export function compareParPointsDeCode(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Clé de tri des sources d'un check : jointe et triée, pour rester déterministe même à sources non triées en entrée. */
function sourcesKey(check: Check): string {
  return [...check.sources].sort(compareParPointsDeCode).join(",");
}

function sortChecksDeterministically(checks: readonly Check[]): Check[] {
  return [...checks].sort(
    (a, b) =>
      compareParPointsDeCode(a.axe, b.axe) ||
      compareParPointsDeCode(a.marche, b.marche) ||
      compareParPointsDeCode(sourcesKey(a), sourcesKey(b)) ||
      compareParPointsDeCode(a.id, b.id),
  );
}

function collectKnownPathIds(referentiel: Referentiel): ReadonlySet<string> {
  const pathIds = new Set<string>();
  for (const axis of referentiel.axes) {
    for (const marche of axis.marches) {
      for (const proofPath of marche.proof_paths) {
        pathIds.add(proofPath.path_id);
      }
    }
  }
  return pathIds;
}

/**
 * Assemble et valide le registre à partir des checks déjà rassemblés (les 5
 * tableaux de `src/packs.ts`, aplatis par l'appelant) et, optionnellement, des
 * fichiers physiquement présents sous `src/checks/**` (l'index généré).
 *
 * Échoue avec {@link RegistryInvalideError}, nommant l'élément fautif, si :
 * - un check déclare un `path_id` absent du référentiel (nomme le check et le `path_id`) ;
 * - un fichier découvert sous `src/checks/**` n'appartient à aucun des checks assemblés
 *   (nomme le fichier orphelin) — chaque check du dépôt doit appartenir à exactement
 *   un pack de `src/packs.ts`.
 *
 * N'échoue jamais, mais avertit (`Registry.warnings`), pour tout `path_id` du
 * référentiel qu'aucun check du registre ne couvre.
 */
export function buildRegistry(
  referentiel: Referentiel,
  checks: readonly Check[],
  discoveredFiles: readonly DiscoveredCheckFile[] = [],
): Registry {
  const knownPathIds = collectKnownPathIds(referentiel);

  for (const check of checks) {
    for (const pathId of check.path_ids) {
      if (!knownPathIds.has(pathId)) {
        throw new RegistryInvalideError(
          `Check "${check.id}" déclare le chemin de preuve "${pathId}", absent du référentiel.`,
        );
      }
    }
  }

  const registeredCheckIds = new Set(checks.map((check) => check.id));
  for (const discovered of discoveredFiles) {
    if (!registeredCheckIds.has(discovered.checkId)) {
      throw new RegistryInvalideError(
        `Fichier "${discovered.file}" présent sous src/checks/ mais n'appartient à aucun pack de src/packs.ts ` +
          `(check_id "${discovered.checkId}" non enregistré).`,
      );
    }
  }

  const coveredPathIds = new Set<string>();
  for (const check of checks) {
    for (const pathId of check.path_ids) {
      coveredPathIds.add(pathId);
    }
  }

  const warnings: string[] = [];
  for (const pathId of [...knownPathIds].sort(compareParPointsDeCode)) {
    if (!coveredPathIds.has(pathId)) {
      warnings.push(`Chemin de preuve "${pathId}" sans aucun check couvrant — marche non vérifiable pour l'instant.`);
    }
  }

  return {
    checks: sortChecksDeterministically(checks),
    warnings,
  };
}

/** Résultat de {@link runCheck} : preuves produites, ou inconnu motivé (jamais d'exception qui remonte). */
export type CheckOutcome = readonly Evidence[] | { readonly unknown: true; readonly warning: string };

function unknownOutcome(warning: string): { readonly unknown: true; readonly warning: string } {
  return { unknown: true, warning };
}

/**
 * Exécute un check isolé. Ne laisse jamais une exception du check remonter à
 * l'appelant : un check désactivé, ou dont `run` lève, rend uniquement
 * `{unknown: true, warning}` — jamais d'Evidence, jamais de crash du registre ni
 * des autres checks du même pack.
 */
export function runCheck(check: Check, context: ProfileContext, referentiel: Referentiel): CheckOutcome {
  if (!check.enabled) {
    return unknownOutcome(
      `Check "${check.id}" désactivé — chemin(s) rendu(s) inconnu(s) : ${
        check.path_ids.length > 0 ? check.path_ids.join(", ") : "aucun"
      }.`,
    );
  }
  try {
    return check.run(context, referentiel);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return unknownOutcome(`Check "${check.id}" a levé une exception à l'exécution : ${detail}`);
  }
}
