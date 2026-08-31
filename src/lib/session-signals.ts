/**
 * Signaux `S.*` extraits du digest de session. Consommés par
 * `src/checks/core-session/{H6,H7,I2,I3,O2,O3,O4,P2,T2,T3}.session.ts`.
 * `SessionDigest` (`sources/session.ts`) n'expose ni le rôle ni le texte PAR
 * TOUR au-delà de `excerpt` (chaîne aplatie `"speaker: texte"` par tour,
 * séquence d'outils en tête, tronquée à 2400 caractères) : toute détection ici
 * est donc un motif de texte sur `excerpt` dans son ensemble, jamais une
 * analyse structurée tour par tour — limite structurelle de la source, pas un
 * choix de ce module.
 *
 * Convention tri-state uniforme : `digest` absent (`ctx.session === undefined`,
 * aucune session pour ce profil) ⇒ `undefined` sur CHAQUE fonction (jamais
 * regardé) ; `digest` présent (même `turnCount: 0`, ex. structure non reconnue)
 * ⇒ valeur réelle (looked, éventuellement `false`/`0`).
 *
 * Force toujours `"indice"`, jamais calculée ici : `ProfileContext.session`
 * (`core/types.ts`) n'expose qu'UN SEUL `SessionDigest` (un seul `session.md`
 * par profil) — une règle du type « prouvé à partir de N sessions » est donc
 * structurellement inatteignable avec ce modèle de données. `referentiel.json`
 * fige `force: "indice"` pour CHAQUE `proof_path` de source `S` consommé par ce
 * module (`T2.p3`, `T3.p3`, `H6.p2`, `H7.p2`, `I2.p2`, `I3.p2`, `P2.p2`,
 * `O2.p3`, `O3.p3`, `O4.p3`), et `buildEvidence`/`evaluateProofPathDefault`
 * (`lib/threshold-eval.ts`) lisent `force` depuis CETTE déclaration, jamais
 * calculée par un check — aucune marche ne peut donc jamais être « prouvée »
 * par la session seule. Une contre-preuve (polarité, pas force) reste émise
 * par une SEULE session dès que le signal correspondant est observé
 * explicitement `false` — cohérent avec « une session peut infirmer » : aucune
 * règle spéciale requise, la négation complète par défaut
 * d'`evaluateProofPathDefault` suffit déjà.
 *
 * `H1`/`O1` sont des marches `"default": true` à `proof_paths: []` (aucun
 * `path_id` ne peut leur être rattaché) — aucune fonction de ce module ne leur
 * est donc dédiée ; `H1.session.ts`/`O1.session.ts` restent des NO-OP, même
 * schéma que `H1.default.ts`/`O1.default.ts`. Les motifs de texte pertinents
 * (déjà couverts par {@link firstPromptFramed} pour la partie « objectif +
 * fichiers + contrainte ») n'ont donc de destination QUE via `I2.p2`, jamais
 * `H1`.
 */

import type { SessionDigest } from "../sources/session.js";

export type TriBoolean = boolean | undefined;
export type TriCount = number | undefined;

function excerptOf(digest: SessionDigest | undefined): string | undefined {
  return digest === undefined ? undefined : digest.excerpt;
}

function testAny(text: string | undefined, patterns: readonly RegExp[]): TriBoolean {
  if (text === undefined) {
    return undefined;
  }
  return patterns.some((pattern) => pattern.test(text));
}

const OBJECTIVE_PATTERN = /\b(ajoute|ajouter|implémente|implement|crée|créer|create|corrige|corriger|fix|migre|migrer|migrate|construis|build)\b/i;
const CONSTRAINT_PATTERN = /\b(ne\s+\w+\s+(jamais|pas)|must|never|ne\s+d[ée]vie\s+pas|ne\s+touche\s+pas)\b/i;
const PLAUSIBLE_PATH_PATTERN = /[`"']?((?:[\w.-]+\/){1,}[\w.-]*|[\w.-]+\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|md|mdx|json|yaml|yml|toml|sql|css|scss|html))[`"']?/;

/** `I2.p2` — `S.first_prompt_framed` : objectif + fichier(s)/chemin plausible + contrainte, n'importe où dans le digest. */
export function firstPromptFramed(digest: SessionDigest | undefined): TriBoolean {
  const text = excerptOf(digest);
  if (text === undefined) {
    return undefined;
  }
  return OBJECTIVE_PATTERN.test(text) && PLAUSIBLE_PATH_PATTERN.test(text) && CONSTRAINT_PATTERN.test(text);
}

// Le mot « question » est vérifié SEUL (jamais combiné en alternation avec
// `?`) pour que la condition ET ci-dessous exige réellement les deux signaux,
// pas seulement la présence d'un point d'interrogation.
const QUESTION_WORD_PATTERN = /\bquestion\b/i;
const QUESTION_MARK_PATTERN = /\?/;
const PHASED_PLAN_PATTERN = /\bplans?\b|\bphases?\b|\bétapes?\b/i;

/** `I3.p2` — `S.milestone_framing_present` : question de clarification (mot « question » ET « ? ») OU plan/phases/étape évoqués. */
export function milestoneFramingPresent(digest: SessionDigest | undefined): TriBoolean {
  const text = excerptOf(digest);
  if (text === undefined) {
    return undefined;
  }
  const clarifyingQuestion = QUESTION_WORD_PATTERN.test(text) && QUESTION_MARK_PATTERN.test(text);
  return clarifyingQuestion || PHASED_PLAN_PATTERN.test(text);
}

const TESTS_FIRST_PATTERNS: readonly RegExp[] = [/commence\s+par\s+les\s+tests/i, /\[\s*\d+\s*tests?[^\]]*(échec|echec|fail)/i];

/** `O2.p3` — `S.tests_first_seen_failing`. */
export function testsFirstSeenFailing(digest: SessionDigest | undefined): TriBoolean {
  return testAny(excerptOf(digest), TESTS_FIRST_PATTERNS);
}

const CONTEXT_CORRECTION_PATTERNS: readonly RegExp[] = [/\bpourquoi\b/i, /\bcause\b/i, /\btodo\b/i];

/** `O3.p3` — `S.context_correction_or_rca_present`. */
export function contextCorrectionOrRcaPresent(digest: SessionDigest | undefined): TriBoolean {
  return testAny(excerptOf(digest), CONTEXT_CORRECTION_PATTERNS);
}

const AUTONOMOUS_RETRY_PATTERNS: readonly RegExp[] = [
  /jusqu['’]au\s+vert/i,
  /until\s+(it'?s\s+)?green/i,
  /relan(ce|cer)\s+(les\s+|the\s+)?(tests|checks)/i,
];

/** `H6.p2` — `S.autonomous_retry_until_green`. */
export function autonomousRetryUntilGreen(digest: SessionDigest | undefined): TriBoolean {
  return testAny(excerptOf(digest), AUTONOMOUS_RETRY_PATTERNS);
}

const SUBAGENTS_PATTERN = /\bsous-agents?\b|\bsubagents?\b|\borchestr/i;

/** `H7.p2` — `S.subagents_orchestrated`. */
export function subagentsOrchestrated(digest: SessionDigest | undefined): TriBoolean {
  return testAny(excerptOf(digest), [SUBAGENTS_PATTERN]);
}

const PARALLEL_WORKTREES_PATTERNS: readonly RegExp[] = [/\bworktrees?\b/i, /\ben\s+parall[eè]le\b/i, /\bfils?\b/i];

/** `P2.p2` — `S.parallel_worktrees_mentioned`. */
export function parallelWorktreesMentioned(digest: SessionDigest | undefined): TriBoolean {
  return testAny(excerptOf(digest), PARALLEL_WORKTREES_PATTERNS);
}

const AI_REVIEW_BEFORE_PR_PATTERNS: readonly RegExp[] = [/revue\s+(ia|IA|assistant)/i, /review\s+before\s+(the\s+)?pr/i, /self-review/i];

/** `O4.p3` — `S.ai_review_before_pr`. */
export function aiReviewBeforePr(digest: SessionDigest | undefined): TriBoolean {
  return testAny(excerptOf(digest), AI_REVIEW_BEFORE_PR_PATTERNS);
}

const PATH_TOKEN_GLOBAL_PATTERN = /[`"']?((?:[\w.-]+\/){1,}[\w.-]*)[`"']?/g;

/** Premier segment du chemin (avant le premier `/`), en minuscules — proxy de « module ». */
function firstSegment(pathToken: string): string {
  const cleaned = pathToken.replace(/[`"']/g, "");
  const idx = cleaned.indexOf("/");
  return (idx === -1 ? cleaned : cleaned.slice(0, idx)).toLowerCase();
}

/** `T2.p3` — `S.files_touched_single_module` : plus grand groupe de chemins distincts partageant le même premier segment. */
export function filesTouchedSingleModuleCount(digest: SessionDigest | undefined): TriCount {
  const text = excerptOf(digest);
  if (text === undefined) {
    return undefined;
  }
  const matches = text.match(PATH_TOKEN_GLOBAL_PATTERN);
  if (matches === null) {
    return 0;
  }
  const distinctPaths = new Set(matches.map((raw) => raw.replace(/[`"']/g, "")));
  const countBySegment = new Map<string, number>();
  for (const path of distinctPaths) {
    const segment = firstSegment(path);
    countBySegment.set(segment, (countBySegment.get(segment) ?? 0) + 1);
  }
  let max = 0;
  for (const count of countBySegment.values()) {
    if (count > max) {
      max = count;
    }
  }
  return max;
}

/** `T3.p3`, première feuille — `S.has_phased_plan`. */
export function hasPhasedPlan(digest: SessionDigest | undefined): TriBoolean {
  return testAny(excerptOf(digest), [PHASED_PLAN_PATTERN]);
}

const LAYER_KEYWORDS: readonly RegExp[] = [
  /\bfrontend\b|\bfront\b/i,
  /\bbackend\b|\bback\b/i,
  /\bapi\b/i,
  /\bui\b|\binterface\b/i,
  /\bdatabase\b|\bbase\s+de\s+donn[ée]es\b|\bdb\b/i,
  /\bservice\b/i,
  /\bcontr[oô]leur\b|\bcontroller\b/i,
  /\bmod[eè]le\b|\bmodel\b/i,
  /\bmigration\b/i,
  /\bscript\b/i,
  /\bworker\b/i,
  /\bjob\b/i,
  /\bcli\b/i,
  /\binfra\b|\binfrastructure\b/i,
];

/** `T3.p3`, seconde feuille — `S.layers_touched` : nombre de catégories de couches distinctes évoquées. */
export function layersTouchedCount(digest: SessionDigest | undefined): TriCount {
  const text = excerptOf(digest);
  if (text === undefined) {
    return undefined;
  }
  return LAYER_KEYWORDS.filter((pattern) => pattern.test(text)).length;
}
