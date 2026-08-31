/**
 * `checks explain <marche> [profil]` — construit une explication textuelle
 * d'une marche du référentiel : ses chemins de preuve, leurs sources et leurs
 * seuils (toujours), et — si un profil est fourni — la valeur observée
 * (citation chiffrée de chaque `Evidence`), l'état résolu de cette marche pour
 * ce profil et une raison.
 *
 * Réutilise le pipeline complet d'analyse (`src/analyze.ts`.`runAnalysis`)
 * plutôt que de ré-exécuter isolément les checks de la marche demandée : la
 * marche peut être « infirmée » par une incohérence croisée
 * (`core/judge.ts`.`computeAxis`, ex. RC/PR présent mais aucune preuve) qui
 * dépend de tout l'axe, pas seulement de ses propres chemins de preuve —
 * seul le pipeline complet calcule cet état correctement. Filtré ensuite au
 * seul `path_id`/`marche` demandé — coût CPU négligible pour un usage CLI
 * ponctuel (jamais dans une boucle chaude), correction avant vitesse.
 *
 * `report/` ne connaît que le verdict et le référentiel — même frontière que
 * `src/report/html.ts`/`src/report/next-step.ts` (`aidd_docs/memory/
 * architecture.md`).
 */

import type { AnalysisOutcome } from "../analyze.js";
import type { Referentiel, ThresholdExpr } from "../core/referentiel.js";
import { thresholdFor } from "../core/referentiel.js";
import type { AxeId, Etat, Evidence, Force, SourceId } from "../core/types.js";
import { SOURCE_FILE_LABELS } from "./html.js";

/** Tous les identifiants de marche du référentiel, triés (axes dans leur ordre déclaré, marches dans l'ordre de la ligne d'axe). */
export function allMarcheIds(referentiel: Referentiel): readonly string[] {
  const ids: string[] = [];
  for (const axis of referentiel.axes) {
    for (const marche of axis.marches) {
      ids.push(marche.id);
    }
  }
  return ids;
}

/** Trouve la marche demandée dans le référentiel (n'importe quel axe, y compris Ownership). */
function findMarche(
  referentiel: Referentiel,
  marcheId: string,
): { readonly axis: Referentiel["axes"][number]; readonly marche: Referentiel["axes"][number]["marches"][number] } | undefined {
  for (const axis of referentiel.axes) {
    const marche = axis.marches.find((entry) => entry.id === marcheId);
    if (marche) return { axis, marche };
  }
  return undefined;
}

const COMPARATOR_SYMBOLS: Readonly<Record<string, string>> = {
  gte: "≥",
  lte: "≤",
  gt: ">",
  lt: "<",
  eq: "=",
};

/** Rendu textuel récursif d'un `ThresholdExpr` (`condition`, ou combinaison `and`/`or`) — jamais de littéral de seuil dupliqué ailleurs. */
export function formatThreshold(expr: ThresholdExpr): string {
  if (expr.kind === "condition") {
    const symbol = COMPARATOR_SYMBOLS[expr.comparator] ?? expr.comparator;
    const unit = expr.unit !== undefined ? ` ${expr.unit}` : "";
    return `${expr.signal_id} ${symbol} ${String(expr.value)}${unit}`;
  }
  const joiner = expr.kind === "and" ? " ET " : " OU ";
  return expr.of.map((sub) => `(${formatThreshold(sub)})`).join(joiner);
}

export interface ExplainProofPath {
  readonly path_id: string;
  readonly description: string;
  readonly force: Force;
  readonly signal_id: string;
  readonly source: SourceId;
  readonly sourceLabel: string;
  readonly threshold: string;
}

export interface ExplainObservation {
  readonly path_id: string;
  readonly source: SourceId;
  readonly sourceLabel: string;
  readonly polarite: Evidence["polarite"];
  readonly citation: string;
}

export interface ExplainProfileResult {
  readonly subjectId: string;
  readonly etat: Etat;
  readonly reason: string;
  readonly observations: readonly ExplainObservation[];
}

export interface MarcheExplanation {
  readonly marche: string;
  readonly label: string;
  readonly axe: AxeId;
  readonly isDefault: boolean;
  readonly proofPaths: readonly ExplainProofPath[];
  readonly counterProof?: { readonly description: string; readonly signal_id?: string };
  readonly profile?: ExplainProfileResult;
}

/** Chemins de preuve + seuils d'une marche, indépendamment de tout profil — toujours disponible tant que la marche existe. */
export function explainMarche(referentiel: Referentiel, marcheId: string): MarcheExplanation | undefined {
  const found = findMarche(referentiel, marcheId);
  if (!found) return undefined;
  const { axis, marche } = found;

  const proofPaths: ExplainProofPath[] = marche.proof_paths.map((proofPath) => ({
    path_id: proofPath.path_id,
    description: proofPath.description,
    force: proofPath.force,
    signal_id: proofPath.signal_id,
    source: proofPath.source,
    sourceLabel: SOURCE_FILE_LABELS[proofPath.source] ?? proofPath.source,
    threshold: formatThreshold(thresholdFor(referentiel, proofPath.path_id)),
  }));

  return {
    marche: marche.id,
    label: marche.label,
    axe: axis.id,
    isDefault: marche.default,
    proofPaths,
    counterProof: marche.counter_proof ?? undefined,
  };
}

function marcheIdOf(pathId: string): string {
  const dotIndex = pathId.indexOf(".");
  return dotIndex === -1 ? pathId : pathId.slice(0, dotIndex);
}

function resolveEtatFor(referentiel: Referentiel, axe: AxeId, marcheId: string, outcome: AnalysisOutcome): Etat {
  if (axe === "O") {
    const entry = outcome.judgeResult.ownership.etats.find((item) => item.marche === marcheId);
    return entry?.etat ?? "inconnu";
  }
  const axisJudgement = outcome.judgeResult.axes.find((item) => item.axe === axe);
  const entry = axisJudgement?.etats.find((item) => item.marche === marcheId);
  return entry?.etat ?? "inconnu";
}

/** Précédence de source lue directement dans `referentiel.source_precedence` — jamais un littéral dupliqué ici, même valeur que `core/judge.ts` par construction (un seul champ dans `referentiel.json`). */
function buildReasonFor(marcheId: string, etat: Etat, marcheEvidence: readonly Evidence[], sourcePrecedence: readonly SourceId[]): string {
  const bySourcePrecedenceThenId = [...marcheEvidence].sort((a, b) => {
    const precedenceDelta = sourcePrecedence.indexOf(a.source) - sourcePrecedence.indexOf(b.source);
    return precedenceDelta !== 0 ? precedenceDelta : a.id.localeCompare(b.id);
  });
  const withCitation = bySourcePrecedenceThenId.find((item) => item.citation !== undefined && item.citation.length > 0);
  if (withCitation?.citation !== undefined) {
    return `${marcheId} (${etat}) : ${withCitation.citation}`;
  }
  if (etat === "infirmé") return `${marcheId} : contre-preuve retenue — marche infirmée.`;
  if (etat === "déclaré") return `${marcheId} : seulement déclaré — sans poids pour la montée de rang.`;
  if (etat === "prouvé" || etat === "indice") return `${marcheId} (${etat}) : preuve observée, sans citation chiffrée disponible.`;
  return `${marcheId} : aucune preuve disponible — marche inconnue.`;
}

/**
 * Complète une {@link MarcheExplanation} avec l'état, la raison et les
 * observations chiffrées pour UN profil déjà analysé (`AnalysisOutcome`,
 * `src/analyze.ts`.`runAnalysis`) — l'appelant (`src/cli.ts`) reste seul
 * responsable de lancer l'analyse et de choisir le `subjectId`.
 */
export function explainMarcheForProfile(base: MarcheExplanation, outcome: AnalysisOutcome, subjectId: string): MarcheExplanation {
  const marcheEvidence = outcome.evidence.filter((item) => marcheIdOf(item.path_id) === base.marche);
  const etat = resolveEtatFor(outcome.referentiel, base.axe, base.marche, outcome);
  const reason = buildReasonFor(base.marche, etat, marcheEvidence, outcome.referentiel.source_precedence);

  const observations: ExplainObservation[] = marcheEvidence.map((item) => ({
    path_id: item.path_id,
    source: item.source,
    sourceLabel: SOURCE_FILE_LABELS[item.source] ?? item.source,
    polarite: item.polarite,
    citation: item.citation !== undefined && item.citation.length > 0 ? item.citation : "aucune citation chiffrée fournie.",
  }));

  return {
    ...base,
    profile: { subjectId, etat, reason, observations },
  };
}

/** Rendu texte français, format stable (`checks explain`, stdout) — jamais de JSON ici (commande d'inspection humaine). */
export function formatExplanation(explanation: MarcheExplanation): string {
  const lines: string[] = [];
  lines.push(`Marche ${explanation.marche} — ${explanation.label} (axe ${explanation.axe})`);
  lines.push("");

  if (explanation.isDefault && explanation.proofPaths.length === 0) {
    lines.push("Marche par défaut : aucun chemin de preuve — prouvée dès qu'une preuve d'usage de l'IA existe ailleurs dans le profil.");
  } else {
    lines.push(`Chemins de preuve (${explanation.proofPaths.length}) :`);
    for (const proofPath of explanation.proofPaths) {
      lines.push(
        `  - ${proofPath.path_id} [${proofPath.force}] source ${proofPath.sourceLabel} (${proofPath.source}), signal ${proofPath.signal_id}`,
      );
      lines.push(`      seuil : ${proofPath.threshold}`);
      lines.push(`      ${proofPath.description}`);
    }
  }

  if (explanation.counterProof) {
    lines.push("");
    lines.push(`Contre-preuve définie : ${explanation.counterProof.description}`);
  }

  if (explanation.profile) {
    lines.push("");
    lines.push(`Profil : ${explanation.profile.subjectId}`);
    lines.push(`  état résolu : ${explanation.profile.etat}`);
    lines.push(`  raison      : ${explanation.profile.reason}`);
    if (explanation.profile.observations.length === 0) {
      lines.push("  valeur observée : aucune (aucune Evidence pour cette marche sur ce profil).");
    } else {
      lines.push(`  valeurs observées (${explanation.profile.observations.length}) :`);
      for (const observation of explanation.profile.observations) {
        lines.push(`    - ${observation.path_id} [${observation.polarite}] ${observation.sourceLabel} : ${observation.citation}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}
