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
 * Ne réimplémente aucune logique de jugement : `input.agentic` est le JSON
 * déjà produit par `judge-from-signals.ts`, passé tel quel. Ce script ne fait
 * qu'assembler et écrire.
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
 * `verdict.json`/`meta.json`/`report.md` : à `input` identique
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
  /** Sortie telle quelle de `judge-from-signals.ts` (action 03). */
  readonly agentic: { readonly result: Record<string, unknown>; readonly evidence_count: number };
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
  readonly confiance: number;
}

interface DeterministicResultShape {
  readonly profile_id: string;
  readonly rang_affiche: string | null;
  readonly fourchette: { readonly bas: string; readonly haut: string };
  readonly confiance_globale: number;
  /** Confiance par axe officiel (T/H/I/P — Ownership n'a pas de confiance, exclu du min de confiance_globale). */
  readonly axes: readonly AxisConfidence[];
  /** Une ligne par marche en désaccord entre sources — jamais la même liste entre les deux chemins, voir renderConfidenceSection. */
  readonly incoherences: readonly string[];
}

/**
 * `confiance_globale` diffère rarement par hasard : elle vient du MINIMUM des 4 axes
 * officiels, donc un seul axe moins bien couvert par l'extraction agentique (ou mieux,
 * via un signal SU.* structurellement hors de portée du CLI) suffit à la faire bouger.
 * Cette table rend l'écart explicable axe par axe, jamais seulement un nombre global
 * qui change sans qu'on sache pourquoi (cf. `.claude/rules/fiabilite.md`).
 */
function renderConfidenceSection(detAxes: readonly AxisConfidence[], agAxes: readonly AxisConfidence[]): string {
  const agByAxe = new Map(agAxes.map((a) => [a.axe, a.confiance]));
  const rows = detAxes
    .map((det) => {
      const ag = agByAxe.get(det.axe);
      const delta = ag !== undefined ? ag - det.confiance : undefined;
      const deltaLabel = delta === undefined ? "—" : delta === 0 ? "=" : delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
      return `| ${det.axe} | ${det.confiance} | ${ag ?? "—"} | ${deltaLabel} |`;
    })
    .join("\n");
  return `## Confiance par axe

La confiance globale est le MINIMUM des 4 axes officiels (Ownership exclu) — un seul axe
en retard suffit à la faire baisser. Cette table explique d'où vient l'écart ci-dessus,
axe par axe, plutôt que de laisser un nombre global changer sans dire pourquoi.

| Axe | Déterministe | Agentique | Écart |
| --- | --- | --- | --- |
${rows}
`;
}

/**
 * Les deux chemins n'extraient pas exactement les mêmes preuves par source (le CLI lit
 * des champs JSON directement, l'agentique relit le texte brut) — leurs listes
 * d'incohérences entre sources divergent donc légitimement, même quand le rang final
 * est identique. Cette section le dit explicitement plutôt que de le laisser caché
 * dans verdict.json.
 */
function renderIncoherencesComparisonSection(detIncoherences: readonly string[], agIncoherences: readonly string[]): string {
  const detSet = new Set(detIncoherences);
  const agSet = new Set(agIncoherences);
  const common = detIncoherences.filter((i) => agSet.has(i));
  const detOnly = detIncoherences.filter((i) => !agSet.has(i));
  const agOnly = agIncoherences.filter((i) => !detSet.has(i));

  if (detIncoherences.length === 0 && agIncoherences.length === 0) {
    return `## Incohérences entre sources — comparaison

Aucune incohérence entre sources détectée par aucun des deux chemins sur ce profil.
`;
  }

  const renderList = (items: readonly string[]): string => (items.length === 0 ? "(aucune)" : items.map((i) => `- ${i}`).join("\n"));

  return `## Incohérences entre sources — comparaison

Les deux chemins n'extraient pas les mêmes preuves par source (lecture de champs JSON
pour le déterministe, relecture de texte brut pour l'agentique) — leurs incohérences
détectées entre sources divergent donc légitimement, même à rang final identique.

**Communes aux deux chemins (${common.length}) :**
${renderList(common)}

**Seulement côté déterministe (${detOnly.length}) :**
${renderList(detOnly)}

**Seulement côté agentique (${agOnly.length}) :**
${renderList(agOnly)}
`;
}

function renderReportMd(
  deterministic: DeterministicResultShape,
  input: FinalReportInput,
  generatedAt: string,
): string {
  const agentic = input.agentic.result as {
    rang_affiche: string | null;
    confiance_globale: number;
    axes: readonly AxisConfidence[];
    incoherences: readonly string[];
  };
  const rows = input.comparison.rows
    .map((row) => `| ${row.axe} | ${row.deterministic ?? "—"} | ${row.agentic ?? "—"} | ${row.match ? "oui" : "**non**"} |`)
    .join("\n");
  const mismatchSection =
    input.comparison.mismatch_notes.length === 0
      ? "Aucun désaccord entre les deux chemins sur ce profil."
      : input.comparison.mismatch_notes.map((note) => `- ${note}`).join("\n");

  return `# Rapport final — ${deterministic.profile_id}

Généré le ${generatedAt}. Comparaison entre le chemin déterministe (\`node dist/cli.js analyze\`) et le chemin agentique (skill \`recognaize-agentic\`) sur le même profil.

## Verdict

| | Rang affiché | Fourchette | Confiance globale |
| --- | --- | --- | --- |
| Déterministe | ${deterministic.rang_affiche ?? "indéterminé"} | ${deterministic.fourchette.bas} – ${deterministic.fourchette.haut} | ${deterministic.confiance_globale} |
| Agentique | ${agentic.rang_affiche ?? "indéterminé"} | — | ${agentic.confiance_globale} |

${renderConfidenceSection(deterministic.axes, agentic.axes)}
## Comparaison par axe

| Axe | Déterministe | Agentique | Concordance |
| --- | --- | --- | --- |
${rows}

## Désaccords

${mismatchSection}

${renderIncoherencesComparisonSection(deterministic.incoherences, agentic.incoherences)}
## Exécution (estimation, jamais une mesure)

- **Modèle** : ${input.model}
- **Tokens estimés** : ~${input.token_estimate.estimated_tokens} (${input.token_estimate.prompt_chars} caractères de prompt + ${input.token_estimate.output_chars} caractères de réponse). ${input.token_estimate.note}
- **Coût estimé** : ~$${input.cost_estimate.usd.toFixed(4)}. ${input.cost_estimate.note}

## Sources

- Résultat déterministe complet : \`${input.deterministic_result_path}\`
- Ce dossier ne duplique jamais \`recognaize-cli-out/\` — \`verdict.json\` ici ne contient que le verdict agentique et la comparaison.
`;
}

function main(): void {
  const raw = readFileSync(0, "utf8");
  const input = JSON.parse(raw) as FinalReportInput;

  const deterministicRaw = readFileSync(resolve(input.deterministic_result_path), "utf8");
  const deterministic = JSON.parse(deterministicRaw) as DeterministicResultShape;

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

  atomicWriteFileSync(resolve(outputDir, "verdict.json"), JSON.stringify(verdict, null, 2) + "\n");
  atomicWriteFileSync(resolve(outputDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  atomicWriteFileSync(resolve(outputDir, "report.md"), renderReportMd(deterministic, input, generatedAt));

  process.stdout.write(JSON.stringify({ out_dir: outputDir }, null, 2) + "\n");
}

main();
