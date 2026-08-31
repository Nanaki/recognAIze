/**
 * Invariants runtime du juge : détecte et rapporte, ne décide jamais de la
 * politique (avertissement CLI vs échec de test — la décision revient à
 * l'appelant, `cli.ts`). Chaque violation est un objet structuré, jamais une
 * exception.
 *
 * Les 7 invariants couverts :
 *   (a) un résultat est toujours produit (le juge ne lève jamais) ;
 *   (b) `fourchette.bas ≤ fourchette.haut` ;
 *   (c) un rang implique une fourchette et une confiance présentes ;
 *   (d) tous les ids d'`Evidence` sont uniques ;
 *   (e) tout `path_id` référencé a un seuil dans le référentiel chargé ;
 *   (f) `evidence + inconnus = taille du registre` (granularité par check,
 *       cohérente avec `core/registry.ts`) ;
 *   (g) `0 ≤ confiance ≤ 1` pour chaque axe et pour la confiance globale.
 */

import type { CheckOutcome } from "./registry.js";
import type { Referentiel } from "./referentiel.js";
import { RANGS_ORDONNES, type Evidence, type Fourchette } from "./types.js";
import type { JudgeResult } from "./judge.js";

export interface InvariantWarning {
  readonly invariant:
    | "resultat-produit"
    | "fourchette-bas-haut"
    | "rang-implique-fourchette-et-confiance"
    | "evidence-ids-uniques"
    | "seuil-present-pour-path-id"
    | "evidence-plus-inconnus-egale-registre"
    | "confiance-bornee";
  readonly message: string;
}

/**
 * Contexte fourni par l'appelant. `result` est `null` uniquement si le juge a
 * levé une exception (l'invariant (a) sert alors à le rapporter — ce module ne
 * peut pas observer un throw après coup, c'est à l'appelant de l'attraper et
 * de passer `null` ici).
 *
 * `checkOutcomes`/`registreSize` : granularité par check (pas par `Evidence`),
 * comme défini par `core/registry.ts` — chaque check produit soit un tableau
 * `Evidence[]` (même vide), soit `{unknown: true}`, jamais les deux, jamais ni
 * l'un ni l'autre.
 */
export interface InvariantContext {
  readonly referentiel: Referentiel;
  readonly result: JudgeResult | null;
  readonly evidence: readonly Evidence[];
  readonly checkOutcomes: readonly CheckOutcome[];
  readonly registreSize: number;
}

function checkResultatProduit(context: InvariantContext): InvariantWarning[] {
  if (context.result === null) {
    return [
      {
        invariant: "resultat-produit",
        message:
          "Aucun résultat produit par le juge (exception levée ou absence de retour) — un refus explicite était attendu, jamais un crash silencieux.",
      },
    ];
  }
  return [];
}

function checkFourchetteOrdre(context: InvariantContext): InvariantWarning[] {
  if (context.result === null) return [];
  const warnings: InvariantWarning[] = [];
  const verify = (label: string, fourchette: Fourchette): void => {
    const basIndex = RANGS_ORDONNES.indexOf(fourchette.bas);
    const hautIndex = RANGS_ORDONNES.indexOf(fourchette.haut);
    if (basIndex < 0 || hautIndex < 0 || basIndex > hautIndex) {
      warnings.push({
        invariant: "fourchette-bas-haut",
        message: `${label} : "bas" (${JSON.stringify(fourchette.bas)}) doit être ≤ "haut" (${JSON.stringify(fourchette.haut)}).`,
      });
    }
  };
  verify("fourchette globale", context.result.fourchette);
  return warnings;
}

function checkRangImpliqueFourchetteEtConfiance(context: InvariantContext): InvariantWarning[] {
  if (context.result === null) return [];
  const warnings: InvariantWarning[] = [];
  const { rang_ponctuel: rangPonctuel, fourchette, confiance_globale: confianceGlobale } = context.result;
  if (rangPonctuel !== null) {
    if (fourchette === undefined || fourchette === null) {
      warnings.push({
        invariant: "rang-implique-fourchette-et-confiance",
        message: "Un rang ponctuel est présent sans fourchette associée.",
      });
    }
    if (typeof confianceGlobale !== "number" || Number.isNaN(confianceGlobale)) {
      warnings.push({
        invariant: "rang-implique-fourchette-et-confiance",
        message: `Un rang ponctuel (${rangPonctuel}) est présent sans confiance globale valide (reçu : ${String(confianceGlobale)}).`,
      });
    }
  }
  return warnings;
}

function checkEvidenceIdsUniques(context: InvariantContext): InvariantWarning[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of context.evidence) {
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  if (duplicates.size > 0) {
    return [
      {
        invariant: "evidence-ids-uniques",
        message: `Identifiants d'Evidence dupliqués : ${[...duplicates].sort().join(", ")}.`,
      },
    ];
  }
  return [];
}

function checkSeuilPresentPourPathId(context: InvariantContext): InvariantWarning[] {
  const missing = new Set<string>();
  for (const item of context.evidence) {
    if (!(item.path_id in context.referentiel.thresholds)) {
      missing.add(item.path_id);
    }
  }
  if (missing.size > 0) {
    return [
      {
        invariant: "seuil-present-pour-path-id",
        message: `path_id référencé par une Evidence sans seuil dans le référentiel chargé : ${[...missing].sort().join(", ")}.`,
      },
    ];
  }
  return [];
}

function checkEvidencePlusInconnusEgaleRegistre(context: InvariantContext): InvariantWarning[] {
  const produced = context.checkOutcomes.filter((outcome) => Array.isArray(outcome)).length;
  const unknown = context.checkOutcomes.length - produced;
  if (produced + unknown !== context.registreSize) {
    return [
      {
        invariant: "evidence-plus-inconnus-egale-registre",
        message: `evidence (${produced}) + inconnus (${unknown}) = ${produced + unknown} ≠ taille du registre (${context.registreSize}).`,
      },
    ];
  }
  return [];
}

function checkConfianceBornee(context: InvariantContext): InvariantWarning[] {
  if (context.result === null) return [];
  const warnings: InvariantWarning[] = [];
  const verify = (label: string, value: number): void => {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      warnings.push({
        invariant: "confiance-bornee",
        message: `${label} : confiance hors de [0 ; 1] ou non numérique (reçu : ${String(value)}).`,
      });
    }
  };
  verify("confiance globale", context.result.confiance_globale);
  for (const axis of context.result.axes) {
    verify(`confiance axe ${axis.axe}`, axis.confiance);
  }
  return warnings;
}

/** Exécute les 7 invariants et renvoie toutes les violations détectées (jamais de throw). */
export function checkInvariants(context: InvariantContext): readonly InvariantWarning[] {
  return [
    ...checkResultatProduit(context),
    ...checkFourchetteOrdre(context),
    ...checkRangImpliqueFourchetteEtConfiance(context),
    ...checkEvidenceIdsUniques(context),
    ...checkSeuilPresentPourPathId(context),
    ...checkEvidencePlusInconnusEgaleRegistre(context),
    ...checkConfianceBornee(context),
  ];
}
