/**
 * Évaluateur générique d'expressions de seuil (`ThresholdExpr`, `core/referentiel.ts`)
 * et constructeur d'`Evidence`. Centralise la seule logique de
 * comparaison numérique/enum/booléenne utilisée par TOUS les checks de
 * `src/checks/core-git-activity/*.{git-activity,pull-requests}.ts`, pour que ces
 * fichiers eux-mêmes ne contiennent jamais rien d'autre qu'un `1`/`0` littéral
 * (`.claude/rules/fiabilite.md`, `evals/anti-literal.ts` — qui ne scanne que
 * `src/checks/**`, jamais `src/lib/`).
 *
 * Logique à 3 valeurs (`TriState`) : un signal absent (`observed === undefined`)
 * rend la condition — et toute expression qui en dépend — `"unknown"`, jamais
 * `"false"` par défaut (`.claude/rules/fiabilite.md` : « l'inconnu ne prouve ni
 * n'infirme jamais »). `and`/`or` composent ces 3 valeurs par les règles logiques
 * usuelles (ex. `or(false, unknown) = unknown`, jamais `false` — un seul opérande
 * qui manque de donnée empêche de conclure à la fausseté du tout).
 *
 * Règle de polarité PAR DÉFAUT (`evaluateProofPathDefault`) : `"true"` ⇒ preuve,
 * `"false"` ⇒ contre-preuve (négation booléenne complète de l'expression), sauf
 * pour les marches dont le référentiel documente une contre-preuve strictement
 * plus étroite que la négation complète (`T4` : « aucune PR XL », plus fort que
 * `xl_ratio < 0,2` ; `H2`-`H5` : contre-preuve conditionnée à `context_files`
 * TOUT à zéro, pas à la simple négation de leur propre `.p2` ; `P2` : contre-preuve
 * limitée à `GA.max_concurrent_branches < 2`, jamais la négation complète du `or`).
 * Ces marches n'utilisent PAS `evaluateProofPathDefault` — elles appellent `evaluateExpr` et
 * `buildEvidence` directement avec leur propre règle, documentée dans le check.
 */

import type { ThresholdExpr } from "../core/referentiel.js";
import { thresholdFor, type Referentiel } from "../core/referentiel.js";
import type { AxeId, Comparator, Evidence, Force, Polarite, SourceId, ValueType } from "../core/types.js";

export type TriState = "true" | "false" | "unknown";
export type SignalValue = number | string | boolean | undefined;

export interface ConditionEval {
  readonly signal_id: string;
  readonly comparator: Comparator;
  readonly threshold: number | string | boolean;
  readonly unit?: string;
  readonly value_type: ValueType;
  readonly observed: SignalValue;
  readonly result: TriState;
}

export interface ExprEval {
  readonly result: TriState;
  readonly conditions: readonly ConditionEval[];
}

/** Ordre croissant des 5 classes de taille — même ordre que `medianFromBuckets` (`lib/median-from-buckets.ts`), dupliqué ici plutôt qu'importé pour ne pas coupler ce module générique à la forme `SizeClass`. */
const SIZE_CLASS_ORDER: readonly string[] = ["xs", "s", "m", "l", "xl"];

function compareOrdered(observed: number, comparator: Comparator, threshold: number): TriState {
  switch (comparator) {
    case "gte":
      return observed >= threshold ? "true" : "false";
    case "lte":
      return observed <= threshold ? "true" : "false";
    case "gt":
      return observed > threshold ? "true" : "false";
    case "lt":
      return observed < threshold ? "true" : "false";
    case "eq":
      return observed === threshold ? "true" : "false";
  }
}

function evaluateCondition(
  observed: SignalValue,
  comparator: Comparator,
  threshold: number | string | boolean,
  valueType: ValueType,
): TriState {
  if (observed === undefined) {
    return "unknown";
  }
  if (valueType === "boolean") {
    if (typeof observed !== "boolean" || typeof threshold !== "boolean") {
      return "unknown";
    }
    return observed === threshold ? "true" : "false";
  }
  if (valueType === "enum") {
    const observedIndex = SIZE_CLASS_ORDER.indexOf(String(observed).toLowerCase());
    const thresholdIndex = SIZE_CLASS_ORDER.indexOf(String(threshold).toLowerCase());
    if (observedIndex === -1 || thresholdIndex === -1) {
      return "unknown";
    }
    return compareOrdered(observedIndex, comparator, thresholdIndex);
  }
  if (typeof observed !== "number" || typeof threshold !== "number") {
    return "unknown";
  }
  return compareOrdered(observed, comparator, threshold);
}

/**
 * Évalue une `ThresholdExpr` (condition, `and` ou `or`, récursivement) contre une
 * table `signal_id -> valeur observée`. Pure, ne lève jamais. `conditions` porte
 * TOUTES les feuilles rencontrées, dans l'ordre de l'arbre — utilisé à la fois
 * pour la citation lisible et pour retrouver une feuille précise par `signal_id`
 * (règle de contre-preuve étroite de `P2`, voir `P2.git-activity.ts`).
 */
export function evaluateExpr(expr: ThresholdExpr, signals: Readonly<Record<string, SignalValue>>): ExprEval {
  if (expr.kind === "condition") {
    const observed = signals[expr.signal_id];
    const result = evaluateCondition(observed, expr.comparator, expr.value, expr.value_type);
    return {
      result,
      conditions: [
        {
          signal_id: expr.signal_id,
          comparator: expr.comparator,
          threshold: expr.value,
          unit: expr.unit,
          value_type: expr.value_type,
          observed,
          result,
        },
      ],
    };
  }

  const subEvals = expr.of.map((sub) => evaluateExpr(sub, signals));
  const conditions = subEvals.flatMap((sub) => sub.conditions);

  if (expr.kind === "and") {
    if (subEvals.some((sub) => sub.result === "false")) return { result: "false", conditions };
    if (subEvals.some((sub) => sub.result === "unknown")) return { result: "unknown", conditions };
    return { result: "true", conditions };
  }

  if (subEvals.some((sub) => sub.result === "true")) return { result: "true", conditions };
  if (subEvals.some((sub) => sub.result === "unknown")) return { result: "unknown", conditions };
  return { result: "false", conditions };
}

const COMPARATOR_SYMBOLS: Record<Comparator, string> = { gte: "≥", lte: "≤", gt: ">", lt: "<", eq: "=" };

function formatValue(value: SignalValue): string {
  if (value === undefined) return "?";
  if (typeof value === "boolean") return value ? "oui" : "non";
  return String(value);
}

export function formatCondition(c: ConditionEval): string {
  const unit = c.unit !== undefined && c.unit.length > 0 ? ` ${c.unit}` : "";
  return `${c.signal_id}=${formatValue(c.observed)}${unit} ${COMPARATOR_SYMBOLS[c.comparator]} ${formatValue(c.threshold)}${unit}`;
}

/** Citation lisible : toutes les feuilles rencontrées, jointes — la structure and/or exacte n'est pas reconstituée (texte informatif, pas une preuve formelle). */
export function formatExprCitation(evalResult: ExprEval): string {
  return evalResult.conditions.map(formatCondition).join(" ; ");
}

export interface ProofPathInfo {
  readonly force: Force;
  readonly signal_id: string;
  readonly source: SourceId;
  readonly description: string;
}

/** Cherche le `proof_path` déclarant `pathId`, où qu'il soit dans les axes du référentiel. Lève si absent — protégé par `runCheck` (`core/registry.ts`), qui transforme toute exception en `{unknown:true}`. */
export function proofPathFor(referentiel: Referentiel, pathId: string): ProofPathInfo {
  for (const axis of referentiel.axes) {
    for (const marche of axis.marches) {
      for (const proofPath of marche.proof_paths) {
        if (proofPath.path_id === pathId) {
          return {
            force: proofPath.force,
            signal_id: proofPath.signal_id,
            source: proofPath.source,
            description: proofPath.description,
          };
        }
      }
    }
  }
  throw new Error(`Chemin de preuve introuvable pour path_id "${pathId}".`);
}

function pickDeterminingCondition(evalResult: ExprEval): ConditionEval | undefined {
  const matching = evalResult.conditions.find((c) => c.result === evalResult.result);
  return matching ?? evalResult.conditions[0];
}

export interface BuildEvidenceParams {
  readonly referentiel: Referentiel;
  readonly checkId: string;
  readonly pathId: string;
  readonly axe: AxeId;
  readonly polarite: Polarite;
  readonly citation: string;
  readonly valueType: ValueType;
  readonly unit: string;
  /** Par défaut, `proofPathFor(pathId).source` — surchargeable (ex. `I4.pull-requests.ts` attribue l'Evidence à `PR`, source déterminante de la précision du dénominateur, bien que le référentiel déclare `I4.p1` sous `GA`). */
  readonly sourceOverride?: SourceId;
}

/** Constructeur bas niveau d'`Evidence` — utilisé directement par les checks à règle de contre-preuve étroite (`T4`, `H2`-`H5`, `P2`), et par {@link evaluateProofPathDefault} pour tous les autres. */
export function buildEvidence(params: BuildEvidenceParams): Evidence {
  const info = proofPathFor(params.referentiel, params.pathId);
  const source = params.sourceOverride ?? info.source;
  return {
    id: `${params.checkId}:${params.pathId}:${params.polarite}`,
    signal_id: info.signal_id,
    valeur: { type: params.valueType, unite: params.unit },
    source,
    check_id: params.checkId,
    path_id: params.pathId,
    concept_id: params.pathId.split(".")[0] ?? params.pathId,
    axe: params.axe,
    polarite: params.polarite,
    force: info.force,
    citation: params.citation,
    confiance_source: params.referentiel.confiance_source[source],
  };
}

export interface EvaluateProofPathDefaultParams {
  readonly referentiel: Referentiel;
  readonly checkId: string;
  readonly pathId: string;
  readonly axe: AxeId;
  readonly signals: Readonly<Record<string, SignalValue>>;
  readonly sourceOverride?: SourceId;
  /** Ajouté entre parenthèses à la citation (ex. « approximation : pull-requests.json absent »). */
  readonly extraCitation?: string;
}

/**
 * Règle de polarité PAR DÉFAUT : `"true"` ⇒ preuve, `"false"` (négation complète
 * de l'expression) ⇒ contre-preuve, `"unknown"` ⇒ aucune `Evidence`. Ne convient
 * PAS à `T4`/`H2`-`H5`/`P2` (voir la docstring de tête de fichier) — ces checks
 * construisent leur `Evidence` directement avec {@link buildEvidence}.
 */
export function evaluateProofPathDefault(params: EvaluateProofPathDefaultParams): Evidence | undefined {
  const expr = thresholdFor(params.referentiel, params.pathId);
  const evalResult = evaluateExpr(expr, params.signals);
  if (evalResult.result === "unknown") {
    return undefined;
  }
  const polarite: Polarite = evalResult.result === "true" ? "preuve" : "contre-preuve";
  const determining = pickDeterminingCondition(evalResult);
  const citationBase = formatExprCitation(evalResult);
  const citation = params.extraCitation !== undefined ? `${citationBase} (${params.extraCitation})` : citationBase;
  return buildEvidence({
    referentiel: params.referentiel,
    checkId: params.checkId,
    pathId: params.pathId,
    axe: params.axe,
    polarite,
    citation,
    valueType: determining?.value_type ?? "boolean",
    unit: determining?.unit ?? "",
    sourceOverride: params.sourceOverride,
  });
}

export { pickDeterminingCondition };
