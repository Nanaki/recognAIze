/**
 * Orchestration pure du pipeline d'analyse. Assemble le `ProfileContext` réel
 * à partir des 8 adaptateurs de `src/sources/`, charge le référentiel,
 * construit le registre, exécute chaque check, appelle `judge()` et rend un
 * résultat structuré. Aucune E/S d'écriture ici (pas de `writeFileSync`, pas
 * de `process.exit`) : `src/cli.ts` reste l'unique endroit qui écrit
 * `result.json` et mappe les erreurs vers un code de sortie (« unique
 * try/catch dans cli.ts », `aidd_docs/memory/architecture.md`).
 *
 * Ce module n'est PAS sous `core/` — comme `src/packs.ts`, il peut donc importer
 * `src/checks/index.ts` et `src/packs.ts` sans violer la frontière
 * `core/ n'importe jamais checks/` de `.claude/rules/fiabilite.md`.
 *
 * Fenêtre d'analyse : `sources/pull-requests.ts` et `sources/repo-context.ts`
 * ont besoin d'une `AsOfWindow` déjà résolue AVANT d'être appelés, mais
 * `core/as-of.ts`.`deriveAsOf` peut aussi dériver cette fenêtre depuis les
 * `merged_at` des PR (`AsOfInput.mergedAts`) — un cycle que ce module ne
 * referme pas : `loadPullRequests` ne rend que des médianes agrégées, jamais
 * les `merged_at` bruts, donc ce module ne peut pas les lui fournir sans
 * dupliquer le parsing JSON de `pull-requests.json`. `period` et `--as-of`
 * restent donc les deux sources réellement exercées ; si aucune des 4 sources
 * de `deriveAsOf` ne résout (aucun `period`, pas de
 * `context_files.last_updated`, pas de `--as-of`), une fenêtre de repli
 * grande ouverte (`FALLBACK_WINDOW`, `0000-01-01`..`9999-12-31`) est utilisée
 * — déterministe, n'exclut jamais une PR par erreur — avec un avertissement
 * explicite.
 *
 * `experimental-llm` (DEC-001) : ce pack reste vide (aucun fichier sous
 * `src/checks/experimental-llm/`) — hors périmètre (`aidd_docs/memory/architecture.md`).
 * L'option CLI `--no-llm` n'existe pas dans `cli.ts` : un drapeau sans effet
 * observable et sans test l'exerçant serait contraire à DEC-001 (« toute
 * capacité non couverte par un test ou une eval est retirée avant le
 * rendu »). Ce module construit le registre à partir de `ALL_CHECKS`
 * inconditionnellement (même précédent que `runChecksList` dans `cli.ts`) ;
 * `includeExperimentalLlm` reste un champ interne d'`AnalysisOptions` —
 * câblage attendu par les tests qui appellent `runAnalysis` directement —
 * mais le seul appelant CLI (`cli.ts`) le fixe à `false` inconditionnellement,
 * `experimental-llm` étant vide et inatteignable depuis la CLI. Réactiver ce
 * pack demanderait de remplacer `ALL_CHECKS` par `includeExperimentalLlm ?
 * ALL_CHECKS : CORE_CHECKS` ici, et de réintroduire un drapeau CLI réel avec
 * sa propre couverture de test.
 */

import { deriveAsOf, type AsOfResult, type AsOfWindow } from "./core/as-of.js";
import type { InvariantWarning } from "./core/invariants.js";
import { checkInvariants } from "./core/invariants.js";
import { judge, type JudgeResult } from "./core/judge.js";
import { loadReferentiel, type Referentiel } from "./core/referentiel.js";
import { buildRegistry, runCheck, type CheckOutcome, type DiscoveredCheckFile, type Registry } from "./core/registry.js";
import type { Evidence, ProfileContext, ProfileWarning, SourceId } from "./core/types.js";
import { hasAiUsageProof } from "./lib/ai-usage-proof.js";
import { ALL_CHECKS } from "./packs.js";
import { DISCOVERED_CHECKS } from "./checks/index.js";
import { loadDeclaratif } from "./sources/declaratif.js";
import { loadGitActivity } from "./sources/git-activity.js";
import { loadProfile } from "./sources/profile.js";
import { loadPullRequests } from "./sources/pull-requests.js";
import { loadRepoContext } from "./sources/repo-context.js";
import { loadSession } from "./sources/session.js";
import { loadSonarMeasures } from "./sources/sonar.js";

/** Fenêtre de repli, grande ouverte — voir la docstring de tête de fichier. */
const FALLBACK_WINDOW: AsOfWindow = { from: "0000-01-01", to: "9999-12-31" };

export interface AnalysisOutcome {
  readonly ctx: ProfileContext;
  readonly referentiel: Referentiel;
  readonly referentielHash: string;
  readonly registry: Registry;
  readonly evidence: readonly Evidence[];
  readonly hasAiUsageProof: boolean;
  readonly judgeResult: JudgeResult;
  readonly invariantWarnings: readonly InvariantWarning[];
  readonly asOf: AsOfResult;
  /** Avertissements textuels, pièces + checks + registre + juge + invariants, dans un ordre déterministe. */
  readonly warnings: readonly string[];
}

export interface AnalysisOptions {
  /** Valeur brute de `--as-of` (peut être `undefined` — voir `core/as-of.ts`.`AsOfInput.explicitAsOf`). */
  readonly explicitAsOf?: string;
  /** Toujours `false` depuis l'unique appelant CLI (`--no-llm` n'existe pas côté CLI) — voir la docstring de tête de fichier. */
  readonly includeExperimentalLlm: boolean;
}

function formatProfileWarning(warning: ProfileWarning): string {
  return `${warning.file} [${warning.code}] : ${warning.cause}`;
}

/**
 * Sources considérées « présentes » pour `JudgeInput.referenceSourcesPresentes` —
 * indépendamment de toute `Evidence` produite (voir la docstring de
 * `core/judge.ts`.`JudgeInput`). `DEC` n'y figure jamais construit ici comme
 * preuve d'usage (seulement comme source potentiellement « présente » pour la
 * mécanique de contre-preuve du juge, cohérent avec DEC-004 : présence ≠ poids).
 */
function computeReferenceSourcesPresentes(flags: Record<SourceId, boolean>): ReadonlySet<SourceId> {
  const present = new Set<SourceId>();
  for (const [source, isPresent] of Object.entries(flags) as [SourceId, boolean][]) {
    if (isPresent) present.add(source);
  }
  return present;
}

/** Assemble le `ProfileContext` réel en appelant les 8 adaptateurs, jamais d'exception (chacun est déjà tolérant). */
function buildProfileContext(
  profileDirAbs: string,
  subjectId: string,
  options: AnalysisOptions,
): { readonly ctx: ProfileContext; readonly asOf: AsOfResult; readonly presence: Record<SourceId, boolean> } {
  const profileWarnings: ProfileWarning[] = [];

  const profileResult = loadProfile(profileDirAbs);
  if (profileResult.ok) {
    profileWarnings.push(...profileResult.warnings);
  } else {
    profileWarnings.push(profileResult.warning);
  }

  const gitActivityResult = loadGitActivity(profileDirAbs);
  if (gitActivityResult.ok) {
    profileWarnings.push(...gitActivityResult.warnings);
  } else {
    profileWarnings.push(gitActivityResult.warning);
  }
  const gitActivity = gitActivityResult.ok ? gitActivityResult.data : undefined;

  const sonarResult = loadSonarMeasures(profileDirAbs);
  if (sonarResult.ok) {
    profileWarnings.push(...sonarResult.warnings);
  } else {
    profileWarnings.push(sonarResult.warning);
  }

  const declaratifResult = loadDeclaratif(profileDirAbs);
  if (declaratifResult.ok) {
    profileWarnings.push(...declaratifResult.warnings);
  } else {
    profileWarnings.push(declaratifResult.warning);
  }

  const sessionResult = loadSession(profileDirAbs);
  if (sessionResult.ok) {
    profileWarnings.push(...sessionResult.warnings);
  } else {
    profileWarnings.push(sessionResult.warning);
  }
  const session = sessionResult.ok ? sessionResult.data : undefined;

  const asOf = deriveAsOf({
    period: gitActivity?.period,
    contextFilesLastUpdated: gitActivity?.context_files?.last_updated,
    explicitAsOf: options.explicitAsOf,
  });
  if (asOf.status === "unknown") {
    profileWarnings.push({
      code: "as_of_unresolved",
      file: subjectId,
      cause: `${asOf.reason} — fenêtre de repli utilisée (${FALLBACK_WINDOW.from}..${FALLBACK_WINDOW.to}).`,
    });
  }
  const window: AsOfWindow = asOf.status === "ok" ? asOf.data.window : FALLBACK_WINDOW;

  const pullRequestsResult = loadPullRequests(profileDirAbs, window);
  if (pullRequestsResult.ok) {
    profileWarnings.push(...pullRequestsResult.warnings);
  } else {
    profileWarnings.push(pullRequestsResult.warning);
  }

  const repoContextResult = loadRepoContext(profileDirAbs, {
    stack: profileResult.ok ? profileResult.data.stack : undefined,
    window,
    contextFilesLastUpdated: gitActivity?.context_files?.last_updated,
    sessionText: session?.excerpt,
  });
  if (repoContextResult.ok) {
    profileWarnings.push(...repoContextResult.warnings);
  } else {
    profileWarnings.push(repoContextResult.warning);
  }

  const ctx: ProfileContext = {
    profileId: subjectId,
    profile: profileResult.ok ? profileResult.data : undefined,
    gitActivity,
    pullRequests: pullRequestsResult.ok ? pullRequestsResult.data : undefined,
    sonarMeasures: sonarResult.ok ? sonarResult.data : undefined,
    repoContext: repoContextResult.ok ? repoContextResult.data : undefined,
    declaratif: declaratifResult.ok ? declaratifResult.data : undefined,
    session,
    warnings: profileWarnings,
  };

  const presence: Record<SourceId, boolean> = {
    GA: gitActivityResult.ok,
    PR: pullRequestsResult.ok,
    RC: repoContextResult.ok,
    S: sessionResult.ok,
    SO: sonarResult.ok,
    // SU lit le même dossier physique que RC (repo-context/), jamais un fichier propre —
    // sa "présence" en tant que pièce suit donc RC. Le check déterministe SU.* reste NO-OP
    // dans tous les cas (voir T2.setup.ts/I2.setup.ts) : SU n'émet une Evidence que via le
    // chemin agentique, jamais le CLI déterministe.
    SU: repoContextResult.ok,
    DEC: declaratifResult.ok,
  };

  return { ctx, asOf, presence };
}

/**
 * Point d'entrée du pipeline d'analyse, appelé par `src/cli.ts`. Ne lève que pour
 * une défaillance véritablement interne (référentiel livré invalide, ou un check
 * enregistré déclarant un `path_id` inconnu du référentiel / un fichier orphelin
 * sous `src/checks/**`) — ces deux cas sont des défauts de construction de
 * l'outil lui-même, jamais une donnée de profil, et restent donc mappés par
 * `cli.ts` sur `EXIT_INTERNAL_ERROR` (`.claude/rules/fiabilite.md` : « exit 1
 * réservé aux erreurs internes »).
 */
export function runAnalysis(profileDirAbs: string, subjectId: string, options: AnalysisOptions): AnalysisOutcome {
  const { ctx, asOf, presence } = buildProfileContext(profileDirAbs, subjectId, options);

  const { referentiel, referentiel_hash: referentielHash } = loadReferentiel();

  const discoveredFiles: DiscoveredCheckFile[] = DISCOVERED_CHECKS.map((entry) => ({
    file: entry.file,
    checkId: entry.check.id,
  }));
  const registry = buildRegistry(referentiel, ALL_CHECKS, discoveredFiles);

  const evidence: Evidence[] = [];
  const checkOutcomes: CheckOutcome[] = [];
  const checkWarnings: string[] = [];
  for (const check of registry.checks) {
    const outcome = runCheck(check, ctx, referentiel);
    checkOutcomes.push(outcome);
    if ("unknown" in outcome) {
      checkWarnings.push(outcome.warning);
    } else {
      evidence.push(...outcome);
    }
  }

  const proof = hasAiUsageProof(ctx);
  const referenceSourcesPresentes = computeReferenceSourcesPresentes(presence);

  const judgeResult = judge({ referentiel, evidence, hasAiUsageProof: proof, referenceSourcesPresentes });

  const invariantWarnings = checkInvariants({
    referentiel,
    result: judgeResult,
    evidence,
    checkOutcomes,
    registreSize: registry.checks.length,
  });

  const warnings: string[] = [
    ...ctx.warnings.map(formatProfileWarning),
    ...checkWarnings,
    ...registry.warnings,
    ...judgeResult.warnings,
    ...invariantWarnings.map((warning) => `invariant "${warning.invariant}" : ${warning.message}`),
  ];

  return {
    ctx,
    referentiel,
    referentielHash,
    registry,
    evidence,
    hasAiUsageProof: proof,
    judgeResult,
    invariantWarnings,
    asOf,
    warnings,
  };
}
