/**
 * Pont déterministe entre l'outil agentique (skills Claude Code) et le juge
 * déjà testé du chemin déterministe. Ne réimplémente AUCUNE logique de
 * jugement : lit un dictionnaire `signal_id -> valeur` (produit par des
 * sous-agents LLM, un par axe), le convertit en `Evidence[]` via
 * `evaluateProofPathDefault` (la même fonction que les 46 checks du CLI
 * appellent), puis appelle `judge()` tel quel.
 *
 * Le LLM n'a qu'un seul travail : extraire une valeur de signal depuis du
 * texte brut (session, git). Aucun champ d'Evidence (force, polarité,
 * confiance_source, source, concept_id) n'est jamais fourni par le LLM —
 * tout est dérivé du référentiel, exactement comme pour le CLI déterministe.
 *
 * Limitation assumée : quelques marches (T4, H2-H5, P2) ont une contre-preuve
 * plus étroite que la négation complète de leur expression dans le CLI
 * déterministe (voir src/lib/threshold-eval.ts, docstring). Ce pont utilise
 * uniformément `evaluateProofPathDefault` (négation complète) pour TOUTES
 * les marches — un léger écart de polarité est possible sur ces marches
 * précises par rapport au CLI. Documenté, pas silencieux.
 *
 * EXCEPTION : `T2.p2` et `T3.p2` (voie PR de T2/T3,
 * `src/checks/core-git-activity/{T2,T3}.pull-requests.ts`) ne produisent
 * JAMAIS de contre-preuve dans le CLI réel — seulement une preuve ou rien
 * (une PR nettement plus GROSSE que la fenêtre M/L ne doit jamais infirmer
 * T2/T3 par la voie PR, seule la voie GA porte la contre-preuve documentée) :
 * la négation complète générique ferait sinon infirmer T2/T3 via PR alors
 * même que GA prouve l'axe par ailleurs, plafonnant l'axe à T1 en
 * incohérence par précédence de source (PR > GA). Ce pont filtre donc
 * explicitement toute Evidence `contre-preuve` sur ces deux path_id avant de
 * les transmettre au juge.
 *
 * DEUXIÈME EXCEPTION : `T4.p1` (`T4.git-activity.ts`) ne contre-prouve QUE si
 * `size_distribution.xl === 0` littéralement (« aucune PR XL »), une
 * condition strictement plus forte que « xl_ratio < 20% » (un ratio bas peut
 * masquer quelques PR XL réelles, qui restent alors `inconnu`, jamais
 * infirmées, dans le CLI réel). Ce pont n'a accès qu'au ratio agrégé
 * (`GA.xl_ratio`), jamais au compte brut — il ne peut donc distinguer « ratio
 * bas avec 0 PR XL » de « ratio bas avec quelques PR XL » que si
 * `GA.xl_ratio === 0` exactement (seul cas où xl_count = 0 est
 * mathématiquement certain pour un total > 0). Toute autre valeur de
 * contre-preuve sur `T4.p1` est donc filtrée : la marche reste `inconnu`
 * plutôt que faussement infirmée, sauf si l'extracteur agentique a la
 * possibilité de fournir directement un ratio nul.
 *
 * Usage : node --loader ts-node/esm scripts/agentic/judge-from-signals.ts < input.json
 * input.json : { "signals": { "GA.size_median": "m", "S.first_prompt_framed": true, ... } }
 */

import { readFileSync } from "node:fs";
import { loadReferentiel } from "../../src/core/referentiel.js";
import { evaluateProofPathDefault, type SignalValue } from "../../src/lib/threshold-eval.js";
import { judge } from "../../src/core/judge.js";
import type { Evidence, AxeId, SourceId } from "../../src/core/types.js";

interface AgenticInput {
  readonly signals: Readonly<Record<string, SignalValue>>;
}

/**
 * Dérive `hasAiUsageProof` (porte d'entrée du juge, cf. `src/lib/ai-usage-proof.ts`)
 * à partir des MÊMES 5 signaux OU, mais lus dans le dictionnaire agentique plutôt
 * que dans un `ProfileContext` structuré. Le déclaratif n'est jamais consulté
 * (cohérent avec DEC-004 : `DEC` ne prouve ni n'infirme jamais l'entrée du juge).
 */
function hasAiUsageProofFromSignals(signals: Readonly<Record<string, SignalValue>>): boolean {
  const aiCoauthored = signals["GA.ai_coauthored_ratio"];
  if (typeof aiCoauthored === "number" && aiCoauthored > 0) return true;
  const harnessArtifact = signals["RC.any_artifact_present"];
  if (harnessArtifact === true) return true;
  const sessionNonEmpty = signals["S.digest_non_empty"];
  if (sessionNonEmpty === true) return true;
  const sessionsPerWeek = signals["GA.sessions_per_week"];
  if (typeof sessionsPerWeek === "number" && sessionsPerWeek > 0) return true;
  return false;
}

/** `T2.p2`/`T3.p2` (voie PR) : jamais de contre-preuve dans le CLI réel — voir docstring de tête. */
const NEVER_COUNTER_PROOF_PATH_IDS: ReadonlySet<string> = new Set(["T2.p2", "T3.p2"]);

/** `T4.p1` : contre-preuve seulement si `GA.xl_ratio === 0` exactement — voir docstring de tête. */
function isNarrowCounterProofAllowed(pathId: string, signals: Readonly<Record<string, SignalValue>>): boolean {
  if (pathId !== "T4.p1") {
    return true;
  }
  return signals["GA.xl_ratio"] === 0;
}

function collectEvidence(
  referentiel: ReturnType<typeof loadReferentiel>["referentiel"],
  signals: Readonly<Record<string, SignalValue>>,
): Evidence[] {
  const evidence: Evidence[] = [];
  for (const axis of referentiel.axes) {
    for (const marche of axis.marches) {
      for (const proofPath of marche.proof_paths) {
        const result = evaluateProofPathDefault({
          referentiel,
          checkId: `agentic:${proofPath.path_id}`,
          pathId: proofPath.path_id,
          axe: axis.id as AxeId,
          signals,
        });
        if (result === undefined) {
          continue;
        }
        if (result.polarite === "contre-preuve" && NEVER_COUNTER_PROOF_PATH_IDS.has(proofPath.path_id)) {
          continue;
        }
        if (result.polarite === "contre-preuve" && !isNarrowCounterProofAllowed(proofPath.path_id, signals)) {
          continue;
        }
        evidence.push(result);
      }
    }
  }
  return evidence;
}

function referenceSourcesPresentesFrom(signals: Readonly<Record<string, SignalValue>>): Set<SourceId> {
  const present = new Set<SourceId>();
  const bySource: Record<SourceId, string> = {
    GA: "GA.",
    PR: "PR.",
    RC: "RC.",
    S: "S.",
    SO: "SO.",
    DEC: "DEC.",
  };
  for (const [source, prefix] of Object.entries(bySource) as [SourceId, string][]) {
    if (Object.keys(signals).some((k) => k.startsWith(prefix) && signals[k] !== undefined)) {
      present.add(source);
    }
  }
  return present;
}

function main(): void {
  const raw = readFileSync(0, "utf8");
  const input = JSON.parse(raw) as AgenticInput;
  const { referentiel } = loadReferentiel();
  const evidence = collectEvidence(referentiel, input.signals);
  const hasAiUsageProof = hasAiUsageProofFromSignals(input.signals);
  const referenceSourcesPresentes = referenceSourcesPresentesFrom(input.signals);
  const result = judge({ referentiel, evidence, hasAiUsageProof, referenceSourcesPresentes });
  process.stdout.write(JSON.stringify({ result, evidence_count: evidence.length }, null, 2) + "\n");
}

main();
