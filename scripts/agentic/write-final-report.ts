/**
 * Dernière étape du chemin agentique : écrit le rapport final consolidé —
 * verdict agentique, comparaison avec le CLI déterministe, et les métadonnées
 * d'exécution (modèle, tokens, coût) — dans `recognaize-out-final/<profile_id>/`, un
 * dossier séparé de `recognaize-cli-out/` (jamais écrasé par lui, jamais l'inverse).
 *
 * `profile_id` est repris TEL QUEL du `result.json` déterministe (déjà
 * assaini par `sanitizeSubject` dans `src/cli.ts`) — jamais recalculé ici,
 * pour que `recognaize-out-final/<profile_id>/` corresponde exactement au
 * `recognaize-cli-out/<profile_id>/` du même run.
 *
 * Ne réimplémente aucune logique de jugement NI de rendu HTML : `input.agentic`
 * est le JSON déjà produit par `judge-from-signals.ts` (résultat jugé +
 * `evidence[]`), passé tel quel dans `report-input.json`. Ce script assemble et
 * écrit — le RENDU (`report.html`) est produit ensuite par la CLI elle-même
 * (`node dist/cli.js export --in <out_dir>/report-input.json --out
 * recognaize-out-final --profile-dir <profile_dir>`, une étape distincte de ce
 * script, documentée dans `.claude/skills/recognaize-agentic/actions/04-write-final-report.md`)
 * — jamais un second renderer Markdown ici (voir
 * `aidd_docs/tasks/2026_08/2026_08_31_agentic-report-html-parity/plan.md`).
 *
 * Tokens et coût : AUCUNE mesure exacte n'est possible ici — l'outil `Agent`
 * d'une session Claude Code ne renvoie pas de métadonnées d'usage à
 * l'orchestrateur (limite de la plateforme, pas un choix de ce projet). Les
 * champs `token_estimate`/`cost_estimate` sont donc calculés par
 * l'orchestrateur (le skill lui-même, à partir de la taille des prompts et
 * réponses qu'il a réellement envoyés/reçus) et seulement TRANSCRITS ici,
 * toujours avec leur `note` d'avertissement — jamais présentés comme une
 * mesure certaine (cf. `.claude/rules/fiabilite.md` : « jamais un rang sans
 * sa fourchette et sa confiance »).
 *
 * Déterminisme : même barre que `result.json` (`.claude/rules/fiabilite.md` —
 * « même entrée → même result.json hors horodatage ») étendue à
 * `verdict.json`/`meta.json`/`report-input.json` : à `input` identique
 * (`generated_at` excepté, seul horodatage produit par ce script — voir
 * `test/agentic/write-final-report.test.ts`, « déterminisme »), deux
 * exécutions écrivent des fichiers strictement identiques. Le script lui-même
 * n'introduit aucune autre source de variation (pas d'horloge, pas d'aléatoire
 * dans le contenu écrit — seul `atomicWriteFileSync` utilise `randomBytes`,
 * pour un nom de fichier TEMPORAIRE jamais visible dans le résultat final).
 *
 * Usage : npx tsx scripts/agentic/write-final-report.ts < input.json
 * input.json : voir {@link FinalReportInput}.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveSubjectOutputDir } from "../../src/core/paths.js";
import { atomicWriteFileSync } from "../../src/report/atomic-write.js";

interface ComparisonRow {
  readonly axe: string;
  readonly deterministic: string | null;
  readonly agentic: string | null;
  readonly match: boolean;
}

interface Comparison {
  readonly rows: readonly ComparisonRow[];
  /** Explication en clair pour chaque ligne où `match` est faux — jamais silencieux sur un désaccord. */
  readonly mismatch_notes: readonly string[];
}

interface TokenEstimate {
  readonly prompt_chars: number;
  readonly output_chars: number;
  readonly estimated_tokens: number;
  readonly note: string;
}

interface CostEstimate {
  readonly usd: number;
  readonly note: string;
}

interface FinalReportInput {
  /** Chemin du `result.json` déterministe produit par l'action 01 du skill. */
  readonly deterministic_result_path: string;
  /** Sortie telle quelle de `judge-from-signals.ts` (action 03) — `result` (JudgeResult) + `evidence[]` + `evidence_count`. */
  readonly agentic: { readonly result: Record<string, unknown>; readonly evidence_count: number; readonly evidence: readonly Record<string, unknown>[] };
  readonly comparison: Comparison;
  readonly model: string;
  readonly token_estimate: TokenEstimate;
  readonly cost_estimate: CostEstimate;
  /** Dossier de profil analysé — pour le même garde-fou anti-écrasement que le CLI (`resolveSubjectOutputDir`). */
  readonly profile_dir: string;
  /** Racine de sortie, par défaut `./recognaize-out-final` (jamais `recognaize-cli-out/`, jamais un sous-dossier du profil). */
  readonly out_dir?: string;
  /** Horodatage ISO — override réservé aux tests (déterminisme) ; sinon `new Date().toISOString()`. */
  readonly generated_at?: string;
}

interface AxisConfidence {
  readonly axe: string;
  readonly niveau_prouve: string | null;
  readonly confiance: number;
}

interface DeterministicResultShape {
  readonly profile_id: string;
  readonly as_of?: unknown;
  readonly rang_affiche: string | null;
  readonly fourchette: { readonly bas: string; readonly haut: string };
  readonly confiance_globale: number;
  /** Confiance par axe officiel (T/H/I/P — Ownership n'a pas de confiance, exclu du min de confiance_globale). */
  readonly axes: readonly AxisConfidence[];
  /** Une ligne par marche en désaccord entre sources — jamais la même liste entre les deux chemins. */
  readonly incoherences: readonly string[];
}

interface AgenticJudgeResultShape {
  readonly status: string;
  readonly rang_prouve: string | null;
  readonly rang_ponctuel: string | null;
  readonly rang_affiche: string | null;
  readonly fourchette: { readonly bas: string; readonly haut: string };
  readonly confiance_globale: number;
  readonly axes: readonly Record<string, unknown>[];
  readonly ownership: Record<string, unknown>;
  readonly verdicts: readonly Record<string, unknown>[];
  readonly incoherences: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Construit le `document` (format `ExportInput.document`,
 * `src/report/export-input.ts`) à partir du verdict jugé agentique — jamais
 * une reconstruction champ par champ des `axes`/`ownership`/`verdicts` (déjà
 * au bon format, produits tels quels par `judge()` via `judge-from-signals.ts`) :
 * seuls `profile_id`/`as_of` sont repris du `result.json` déterministe
 * (jamais recalculés), et `evidence` vient du nouveau champ de
 * `judge-from-signals.ts`.
 */
function buildDocument(
  deterministic: DeterministicResultShape,
  agentic: AgenticJudgeResultShape,
  evidence: readonly Record<string, unknown>[],
): Record<string, unknown> {
  return {
    profile_id: deterministic.profile_id,
    as_of: deterministic.as_of,
    status: agentic.status,
    rang_prouve: agentic.rang_prouve,
    rang_ponctuel: agentic.rang_ponctuel,
    rang_affiche: agentic.rang_affiche,
    fourchette: agentic.fourchette,
    confiance_globale: agentic.confiance_globale,
    axes: agentic.axes,
    ownership: agentic.ownership,
    verdicts: agentic.verdicts,
    evidence,
    warnings: agentic.warnings,
    incoherences: agentic.incoherences,
  };
}

/**
 * Construit `agentic_context` (format `AgenticContext`, `src/report/html.ts`)
 * — le côté AGENTIQUE de la comparaison n'y figure pas : c'est déjà
 * `document` lui-même (voir la docstring de `AgenticContext`).
 */
function buildAgenticContext(
  deterministic: DeterministicResultShape,
  comparison: Comparison,
  model: string,
  tokenEstimate: TokenEstimate,
  costEstimate: CostEstimate,
  generatedAt: string,
): Record<string, unknown> {
  return {
    deterministic: {
      rang_affiche: deterministic.rang_affiche,
      fourchette: deterministic.fourchette,
      confiance_globale: deterministic.confiance_globale,
      axes: deterministic.axes,
      incoherences: deterministic.incoherences,
    },
    comparison,
    execution: {
      model,
      token_estimate: tokenEstimate,
      cost_estimate: costEstimate,
      generated_at: generatedAt,
    },
  };
}

function main(): void {
  const raw = readFileSync(0, "utf8");
  const input = JSON.parse(raw) as FinalReportInput;

  const deterministicRaw = readFileSync(resolve(input.deterministic_result_path), "utf8");
  const deterministic = JSON.parse(deterministicRaw) as DeterministicResultShape;
  const agenticResult = input.agentic.result as unknown as AgenticJudgeResultShape;

  const outputDir = resolveSubjectOutputDir(input.out_dir ?? "./recognaize-out-final", input.profile_dir, deterministic.profile_id);
  const generatedAt = input.generated_at ?? new Date().toISOString();

  const verdict = {
    profile_id: deterministic.profile_id,
    generated_at: generatedAt,
    agentic: input.agentic.result,
    evidence_count: input.agentic.evidence_count,
    comparison: input.comparison,
    deterministic_result_path: resolve(input.deterministic_result_path),
  };

  const meta = {
    generated_at: generatedAt,
    model: input.model,
    token_estimate: input.token_estimate,
    cost_estimate: input.cost_estimate,
  };

  const reportInput = {
    document: buildDocument(deterministic, agenticResult, input.agentic.evidence),
    agentic_context: buildAgenticContext(deterministic, input.comparison, input.model, input.token_estimate, input.cost_estimate, generatedAt),
  };

  atomicWriteFileSync(resolve(outputDir, "verdict.json"), JSON.stringify(verdict, null, 2) + "\n");
  atomicWriteFileSync(resolve(outputDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  atomicWriteFileSync(resolve(outputDir, "report-input.json"), JSON.stringify(reportInput, null, 2) + "\n");

  process.stdout.write(JSON.stringify({ out_dir: outputDir }, null, 2) + "\n");
}

main();
