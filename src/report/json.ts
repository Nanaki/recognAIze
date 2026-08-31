/**
 * Schéma de `result.json`. Champs de version et de contexte, `warnings[]`,
 * `incoherences[]`, `evidence[]` (triée), `verdicts[]`, rang, fourchette,
 * confiance par axe et globale, et les pièces/champs délibérément ignorés
 * (spec, « Non-goals » et « Sorties »).
 *
 * `report/` ne connaît que le verdict (`JudgeResult`/`AnalysisOutcome`) et le
 * référentiel (`referentiel_hash`) — jamais un check réel, jamais `checks/`
 * (`aidd_docs/memory/architecture.md`).
 *
 * Toute valeur numérique non finie (`NaN`/`Infinity`) est assainie en
 * `{status:"unknown", reason}` avant sérialisation — jamais un `null` silencieux
 * (`JSON.stringify(NaN) === "null"` serait indiscernable d'un `null` volontaire) —
 * voir {@link sanitizeNonFinite}. En pratique, chaque source de nombre du pipeline
 * (`core/judge.ts`.`round2`, `core/as-of.ts`) garde déjà cet invariant ; ce
 * passage est un filet de sécurité déterministe, pas une correction de bug
 * connu.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AnalysisOutcome } from "../analyze.js";
import type { AxisJudgement, OwnershipJudgement } from "../core/judge.js";
import { compareParPointsDeCode } from "../core/registry.js";
import type { Confiance, Evidence, Fourchette, Rang, Verdict } from "../core/types.js";

/** Version courante du schéma de `result.json`. */
export const RESULT_SCHEMA_VERSION = "0.5.0-part5-result-json";

/** Résolu depuis `report/json.ts` (`src/` ou `dist/report/`) — deux niveaux au-dessus, à la racine du dépôt. */
function resolvePackageJsonPath(): string {
  return fileURLToPath(new URL("../../package.json", import.meta.url));
}

/** `tool_version` : lu depuis `package.json`.`version`, jamais codé en dur ici. */
export function readToolVersion(): string {
  try {
    const raw = readFileSync(resolvePackageJsonPath(), "utf8");
    const pkg = JSON.parse(raw) as { readonly version?: unknown };
    return typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : "0.0.0-inconnu";
  } catch {
    return "0.0.0-inconnu";
  }
}

/** `as_of` résolu (chaîne stable dérivée des données) ou motif d'indisponibilité — jamais l'heure d'exécution. */
export type AsOfField = string | { readonly status: "unknown"; readonly reason: string };

/** Une pièce ou un champ vu par l'outil mais consciemment jamais pris en compte dans le calcul du rang. */
export interface IgnoredField {
  readonly champ: string;
  readonly raison: string;
}

/**
 * Liste figée des pièces/champs délibérément ignorés (spec « Non-goals » et
 * « Sorties » : « pièces et champs volontairement ignorés »). Cette liste
 * documente que ces champs ont été VUS (les adaptateurs de `src/sources/` les
 * parsent), pas oubliés — aucun check du référentiel ne les consulte.
 */
export const IGNORED_FIELDS: readonly IgnoredField[] = [
  {
    champ: "code/",
    raison:
      "contenu du code source jamais lu pour juger — détecter du « code généré par IA » n'est pas fiable (spec, Non-goals) ; seul l'inventaire de présence compte ailleurs.",
  },
  {
    champ: "git-activity.json:reverted",
    raison: "aucune marche du référentiel ne s'appuie sur le nombre de commits revert.",
  },
  {
    champ: "git-activity.json:message_convention_compliance",
    raison: "la conformité de convention de message de commit n'est pas un axe de la grille officielle.",
  },
  {
    champ: "git-activity.json:repositories",
    raison: "le nombre de dépôts déclarés n'entre dans aucun seuil du référentiel (mode profil, hors dépôt réel).",
  },
  {
    champ: "git-activity.json:median_runs_to_green",
    raison: "mesure de volume/qualité de CI, jamais un plafond ou un axe (spec, Non-goals : qualité du code jamais plafonnante).",
  },
  {
    champ: "git-activity.json:tokens_per_week",
    raison: "toute mesure fondée sur le volume d'usage est hors périmètre au-delà de la simple preuve d'usage de l'IA (spec, Non-goals).",
  },
];

/** Verdict d'axe étendu de sa confiance (produit couverture × accord) — jamais un rang sans sa confiance (`.claude/rules/fiabilite.md`). */
export interface ResultDocument {
  readonly schema_version: string;
  readonly tool_version: string;
  readonly referentiel_hash: string;
  readonly node_version: string;
  readonly as_of: AsOfField;
  readonly profile_id: string;
  readonly status: "ok" | "indeterminate";
  readonly rang_prouve: Rang | null;
  readonly rang_ponctuel: Rang | null;
  readonly rang_affiche: Rang | null;
  readonly fourchette: Fourchette;
  readonly confiance_globale: Confiance;
  readonly axes: readonly AxisJudgement[];
  readonly ownership: OwnershipJudgement;
  readonly verdicts: readonly Verdict[];
  readonly evidence: readonly Evidence[];
  readonly warnings: readonly string[];
  readonly incoherences: readonly string[];
  readonly pieces_et_champs_ignores: readonly IgnoredField[];
}

/** Marche d'un `path_id` : préfixe avant le premier point — même convention que `core/judge.ts`.`marcheIdOf`. */
function marcheOf(pathId: string): string {
  const dotIndex = pathId.indexOf(".");
  return dotIndex === -1 ? pathId : pathId.slice(0, dotIndex);
}

/**
 * Tri des `Evidence` par `(axe, marche, source, check_id)`, en points de code
 * Unicode uniquement (jamais `localeCompare`/`Intl`). Nécessaire à « même
 * entrée → même `result.json` » : l'ordre
 * d'exécution des checks (`registry.checks`, déjà trié) détermine l'ordre
 * d'apparition des `Evidence` en entrée, mais `evidence[]` en sortie doit
 * rester stable même si cet ordre interne changeait un jour.
 */
export function sortEvidence(evidence: readonly Evidence[]): readonly Evidence[] {
  return [...evidence].sort(
    (a, b) =>
      compareParPointsDeCode(a.axe, b.axe) ||
      compareParPointsDeCode(marcheOf(a.path_id), marcheOf(b.path_id)) ||
      compareParPointsDeCode(a.source, b.source) ||
      compareParPointsDeCode(a.check_id, b.check_id) ||
      compareParPointsDeCode(a.id, b.id),
  );
}

/**
 * Assainit récursivement tout `NaN`/`Infinity` rencontré dans l'arbre en
 * `{status:"unknown", reason}` — jamais un `null` silencieux. Ne touche à rien
 * d'autre : chaînes, booléens, `null` volontaires, objets et tableaux
 * traversés tels quels.
 */
export function sanitizeNonFinite(value: unknown): unknown {
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    return { status: "unknown", reason: `valeur numérique non finie (${String(value)}) assainie avant sortie.` };
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeNonFinite);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeNonFinite(entry);
    }
    return out;
  }
  return value;
}

/** Traduit `AnalysisOutcome.asOf` (`core/as-of.ts`.`AsOfResult`) en {@link AsOfField}. */
function toAsOfField(asOf: AnalysisOutcome["asOf"]): AsOfField {
  if (asOf.status === "ok") return asOf.data.asOf;
  return { status: "unknown", reason: asOf.reason };
}

/**
 * Construit le document final `result.json` à partir d'un `AnalysisOutcome`
 * (`src/analyze.ts`) et du sujet déjà assaini (`core/paths.ts`.`sanitizeSubject`,
 * appelé par `src/cli.ts` avant cet appel). Pure : aucune E/S, aucune horloge —
 * la sérialisation/écriture reste à la charge de l'appelant.
 */
export function buildResultDocument(outcome: AnalysisOutcome, sanitizedSubjectId: string): ResultDocument {
  const document: ResultDocument = {
    schema_version: RESULT_SCHEMA_VERSION,
    tool_version: readToolVersion(),
    referentiel_hash: outcome.referentielHash,
    node_version: process.versions.node,
    as_of: toAsOfField(outcome.asOf),
    profile_id: sanitizedSubjectId,
    status: outcome.judgeResult.status,
    rang_prouve: outcome.judgeResult.rang_prouve,
    rang_ponctuel: outcome.judgeResult.rang_ponctuel,
    rang_affiche: outcome.judgeResult.rang_affiche,
    fourchette: outcome.judgeResult.fourchette,
    confiance_globale: outcome.judgeResult.confiance_globale,
    axes: outcome.judgeResult.axes,
    ownership: outcome.judgeResult.ownership,
    verdicts: outcome.judgeResult.verdicts,
    evidence: sortEvidence(outcome.evidence),
    warnings: outcome.warnings,
    incoherences: outcome.judgeResult.incoherences,
    pieces_et_champs_ignores: IGNORED_FIELDS,
  };
  return sanitizeNonFinite(document) as ResultDocument;
}
