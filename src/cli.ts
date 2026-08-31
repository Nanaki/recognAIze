// Point d'entrée CLI. `analyze` détecte le mode, refuse (exit 2) ou analyse
// réellement le profil, puis écrit `result.json` (schéma final,
// `src/report/json.ts`) et `report.html` (fiche complète). `checks list`
// inspecte le référentiel ; `checks explain <marche> [profil]` explique une
// marche, seule ou pour un profil donné.
//
// Règle .claude/rules/fiabilite.md : cli.ts contient l'UNIQUE try/catch du
// programme. Toute exception non prévue → message français + exit 1 (réservé aux
// bugs internes) ; un usage invalide (chemin inexistant, option inconnue, `--mode
// repo`) et un refus explicite (dossier insuffisant) sont distingués explicitement
// dans ce même catch, jamais renvoyés sur le code 1 par défaut.
//
// `--json` ⇒ stdout ne reçoit QUE le JSON du résultat (une ligne), rien
// d'autre n'est jamais écrit sur stdout par `analyze` dans ce run.
// `process.stdout` reçoit un handler `error` dès le chargement du module :
// un lecteur qui ferme tôt le pipe (`| head -1`) déclenche `EPIPE`, ignoré
// ici plutôt que de remonter en exception non attrapée (qui produirait un
// exit code Node par défaut, potentiellement confondu avec l'exit 1 réservé
// aux erreurs internes).

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

import { Command, CommanderError } from "commander";

import { DISCOVERED_CHECKS } from "./checks/index.js";
import {
  EXIT_INTERNAL_ERROR,
  EXIT_REFUSED,
  EXIT_SUCCESS,
  EXIT_USAGE,
  RefusedError,
  UsageError,
} from "./core/errors.js";
import { resolveSubjectOutputDir, sanitizeSubject } from "./core/paths.js";
import {
  deriveProvisionalSubjectId,
  hasGitDirectory,
  isDirectoryEmpty,
  listPieces,
} from "./core/profileFolder.js";
import { loadReferentiel } from "./core/referentiel.js";
import { buildRegistry, type DiscoveredCheckFile, type Registry } from "./core/registry.js";
import { writeProvisionalResult, writeResultDocument } from "./core/resultWriter.js";
import { ALL_CHECKS } from "./packs.js";
import { runAnalysis } from "./analyze.js";
import {
  buildResultDocument,
  IGNORED_FIELDS,
  readToolVersion,
  RESULT_SCHEMA_VERSION,
  sortEvidence,
  type AsOfField,
  type ResultDocument,
} from "./report/json.js";
import { writeReportHtml, type ReportExtras } from "./report/html.js";
import { parseExportInput, type ExportInput } from "./report/export-input.js";
import { writeRunHistory } from "./report/runs.js";
import { loadConcepts, type ConceptsIndex } from "./report/next-step.js";
import { allMarcheIds, explainMarche, explainMarcheForProfile, formatExplanation } from "./report/explain.js";
import { loadGitActivity } from "./sources/git-activity.js";
import { loadSonarMeasures } from "./sources/sonar.js";

/**
 * `EPIPE` sur stdout (lecteur fermé tôt, ex. `| head -1`) ne doit jamais
 * planter le processus ni produire l'exit 1 réservé aux erreurs internes.
 * Installé inconditionnellement (coût nul pour les autres commandes) plutôt
 * que seulement autour de `--json`, pour rester correct même si une future
 * commande écrit aussi sur stdout puis est pipée.
 */
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") return;
  throw error;
});

const PIECE_LABELS: Record<string, string> = {
  "profile.json": "profile.json",
  "git-activity.json": "git-activity.json",
  "pull-requests.json": "pull-requests.json",
  code: "code/",
  "sonar-measures.json": "sonar-measures.json",
  "repo-context": "repo-context/",
  "declaratif.md": "declaratif.md",
  "session.md": "session.md",
};

interface AnalyzeOptions {
  out?: string;
  json?: boolean;
  mode?: string;
  asOf?: string;
}

function runAnalyze(inputPath: string, options: AnalyzeOptions): void {
  const analyzedAbs = resolve(inputPath);
  if (!existsSync(analyzedAbs)) {
    throw new UsageError(`Chemin inexistant : ${inputPath}`);
  }
  if (!statSync(analyzedAbs).isDirectory()) {
    throw new UsageError(`Chemin invalide : ${inputPath} n'est pas un dossier.`);
  }

  const requestedMode = options.mode;
  if (requestedMode === "repo") {
    throw new UsageError("mode dépôt hors périmètre de ce run");
  }
  if (requestedMode !== undefined && requestedMode !== "profile") {
    throw new UsageError(
      `Mode inconnu : "${requestedMode}" (seule la valeur "profile" est disponible dans ce run).`,
    );
  }
  if (requestedMode === undefined) {
    const hasProfileJson = existsSync(resolve(analyzedAbs, "profile.json"));
    if (!hasProfileJson && hasGitDirectory(analyzedAbs)) {
      // .git présent, profile.json absent : détection automatique du mode dépôt —
      // non implémenté dans ce run (US-022), jamais atteint silencieusement.
      throw new UsageError("mode dépôt hors périmètre de ce run");
    }
  }

  const pieces = listPieces(analyzedAbs);
  const presentPieces = pieces.filter((piece) => piece.present);
  const onlyProfileJson = presentPieces.length === 1 && presentPieces[0]?.name === "profile.json";
  const noRecognizedPiece = presentPieces.length === 0;

  const subjectId = sanitizeSubject(deriveProvisionalSubjectId(analyzedAbs, basename(analyzedAbs)));
  const outputDir = resolveSubjectOutputDir(options.out, analyzedAbs, subjectId);

  if (noRecognizedPiece || onlyProfileJson) {
    const missingLabels = pieces
      .filter((piece) => !piece.present)
      .map((piece) => PIECE_LABELS[piece.name] ?? piece.name);
    writeProvisionalResult(outputDir, "refused");
    const cause = isDirectoryEmpty(analyzedAbs)
      ? "le dossier est vide"
      : "le dossier ne contient pas assez de pièces exploitables";
    throw new RefusedError(`Refus : ${cause}. Pièces manquantes : ${missingLabels.join(", ")}.`);
  }

  const outcome = runAnalysis(analyzedAbs, subjectId, {
    explicitAsOf: options.asOf,
    // DEC-001 : toute capacité non couverte par un test ou une eval est
    // retirée avant le rendu — `--no-llm` n'existe donc pas côté CLI (voir
    // `src/analyze.ts`). `includeExperimentalLlm` reste un champ interne
    // d'`AnalysisOptions` (câblage attendu par les tests directs de
    // `runAnalysis`), toujours à `false` depuis ce seul appelant CLI :
    // `experimental-llm` reste un placeholder documenté, vide et désactivé,
    // jamais atteignable depuis la CLI.
    includeExperimentalLlm: false,
  });

  const document = buildResultDocument(outcome, subjectId);
  writeResultDocument(outputDir, document);
  writeRunHistory(outputDir, document);

  if (options.json) {
    // `--json` ⇒ SEUL le JSON du résultat sur stdout, aucune écriture de
    // `report.html` (contrairement au chemin par défaut ci-dessous). Une
    // ligne unique — `head -1` en récupère l'intégralité.
    process.stdout.write(`${JSON.stringify(document)}\n`);
  } else {
    // `report.html` réel : voir `src/report/html.ts` (`ReportExtras`) sur
    // pourquoi ce sous-ensemble étroit de `ctx` est passé en plus du document
    // déjà sérialisable (`result.json`).
    const extras: ReportExtras = {
      declaratif: outcome.ctx.declaratif,
      gitActivity: outcome.ctx.gitActivity,
      sonarMeasures: outcome.ctx.sonarMeasures,
    };
    // `concepts.json` alimente les liens de fiche et les blocs « prochaine
    // marche » du HTML — chargé une seule fois ici, jamais dans
    // `report/html.ts` (qui reste pur). Absent/invalide ⇒ `undefined`,
    // `buildReportHtml` retombe alors sur ses replis textuels — jamais un
    // `analyze` qui plante pour un fichier auxiliaire non essentiel au
    // verdict lui-même.
    let concepts: ConceptsIndex | undefined;
    try {
      concepts = loadConcepts();
    } catch {
      concepts = undefined;
    }
    writeReportHtml(outputDir, document, outcome.referentiel, extras, concepts);
  }
}

interface ExportOptions {
  in: string;
  out: string;
  profileDir?: string;
}

/**
 * `export --in <fichier> --out <dir> [--profile-dir <dir>]` : rend `report.html`
 * à partir de données DÉJÀ JUGÉES (voir `report/export-input.ts`), sans
 * réanalyse — le second chemin (agentique) l'utilise pour produire un rapport
 * au même format que celui du chemin déterministe, jamais un second renderer
 * (`aidd_docs/memory/architecture.md` § Chemin agentique).
 *
 * Les champs administratifs de `result.json` (`schema_version`/`tool_version`/
 * `referentiel_hash`/`node_version`/`pieces_et_champs_ignores`) sont recalculés
 * ICI exactement comme `buildResultDocument` (jamais fournis par l'appelant) —
 * pour ne jamais risquer une désynchronisation avec le référentiel réellement
 * chargé par ce process.
 *
 * `--profile-dir`, s'il est fourni, dérive `ReportExtras.gitActivity`/
 * `sonarMeasures` via les adaptateurs déjà existants (`sources/git-activity.ts`,
 * `sources/sonar.ts`) — `declaratif.md` n'est jamais lu (DEC-004, structurel :
 * `export-input.ts` n'offre même pas de champ pour l'y glisser via `--in`).
 * Le même garde-fou que `analyze` (`resolveSubjectOutputDir`) interdit un
 * `--out` à l'intérieur de `--profile-dir`.
 */
function runExport(options: ExportOptions): void {
  const inAbs = resolve(options.in);
  if (!existsSync(inAbs)) {
    throw new UsageError(`Chemin inexistant : ${options.in}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(inAbs, "utf8"));
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new UsageError(`Entrée --in illisible ou JSON invalide (${options.in}) : ${detail}`);
  }

  const parsed = parseExportInput(raw);
  if (!parsed.ok) {
    throw new UsageError(parsed.error);
  }
  const input: ExportInput = parsed.data;

  let profileDirAbs: string | undefined;
  if (options.profileDir !== undefined) {
    profileDirAbs = resolve(options.profileDir);
    if (!existsSync(profileDirAbs)) {
      throw new UsageError(`Chemin de profil inexistant : ${options.profileDir}`);
    }
    if (!statSync(profileDirAbs).isDirectory()) {
      throw new UsageError(`Chemin de profil invalide : ${options.profileDir} n'est pas un dossier.`);
    }
  }

  // `input.document.profile_id` est DÉJÀ assaini (validé par `ExportInputSchema`,
  // forme `sanitizeSubject`) — ne jamais le réassainir : `sanitizeSubject` n'est
  // pas idempotente (le hash dépend de la chaîne reçue), le réappliquer changerait
  // le nom du dossier de sortie pour un profil déjà connu du chemin déterministe.
  const subjectId = input.document.profile_id;
  const outputDir =
    profileDirAbs !== undefined
      ? resolveSubjectOutputDir(options.out, profileDirAbs, subjectId)
      : resolve(options.out, subjectId);

  const { referentiel, referentiel_hash: referentielHash } = loadReferentiel();

  let extras: ReportExtras = {};
  if (profileDirAbs !== undefined) {
    const gitActivity = loadGitActivity(profileDirAbs);
    const sonarMeasures = loadSonarMeasures(profileDirAbs);
    extras = {
      ...(gitActivity.ok ? { gitActivity: gitActivity.data } : {}),
      ...(sonarMeasures.ok ? { sonarMeasures: sonarMeasures.data } : {}),
    };
    // `declaratif.md` : jamais lu ici, volontairement (voir docstring ci-dessus).
  }

  const asOf: AsOfField = input.document.as_of ?? {
    status: "unknown",
    reason: "non fourni par l'appelant du mode export.",
  };

  const document: ResultDocument = {
    schema_version: RESULT_SCHEMA_VERSION,
    tool_version: readToolVersion(),
    referentiel_hash: referentielHash,
    node_version: process.versions.node,
    as_of: asOf,
    profile_id: input.document.profile_id,
    status: input.document.status,
    rang_prouve: input.document.rang_prouve,
    rang_ponctuel: input.document.rang_ponctuel,
    rang_affiche: input.document.rang_affiche,
    fourchette: input.document.fourchette,
    confiance_globale: input.document.confiance_globale,
    axes: input.document.axes,
    ownership: input.document.ownership,
    verdicts: input.document.verdicts,
    evidence: sortEvidence(input.document.evidence),
    warnings: input.document.warnings,
    incoherences: input.document.incoherences,
    pieces_et_champs_ignores: IGNORED_FIELDS,
  };

  let concepts: ConceptsIndex | undefined;
  try {
    concepts = loadConcepts();
  } catch {
    concepts = undefined;
  }

  writeReportHtml(outputDir, document, referentiel, extras, concepts, input.agentic_context);
}

/** Formate le registre pour `checks list` — déterministe : aucun accès horloge/locale/cwd. */
function formatChecksList(registry: Registry): string {
  const lines: string[] = [];
  lines.push(`Checks enregistrés : ${registry.checks.length}`);
  if (registry.checks.length === 0) {
    lines.push("  (aucun check enregistré)");
  } else {
    for (const check of registry.checks) {
      const state = check.enabled ? "activé" : "désactivé";
      lines.push(
        `  - ${check.id} | axe ${check.axe} | marche ${check.marche} | sources ${check.sources.join(",")} | pack ${check.pack} | ${state}`,
      );
    }
  }
  lines.push("");
  lines.push(`Avertissements — chemins de preuve sans check (${registry.warnings.length}) :`);
  if (registry.warnings.length === 0) {
    lines.push("  (aucun)");
  } else {
    for (const warning of registry.warnings) {
      lines.push(`  - ${warning}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function runChecksList(): void {
  const { referentiel } = loadReferentiel();
  const discoveredFiles: DiscoveredCheckFile[] = DISCOVERED_CHECKS.map((entry) => ({
    file: entry.file,
    checkId: entry.check.id,
  }));
  const registry = buildRegistry(referentiel, ALL_CHECKS, discoveredFiles);
  process.stdout.write(formatChecksList(registry));
}

/**
 * `checks explain <marche> [profil]`. Marche inconnue du référentiel ⇒
 * message français listant les identifiants valides, `UsageError` ⇒
 * **exit 3** : la spec verrouillée réserve l'exit 1 aux seuls défauts
 * internes ; une marche inconnue est un usage invalide, jamais un bug
 * interne.
 */
function runChecksExplain(marche: string, profilePath: string | undefined): void {
  const { referentiel } = loadReferentiel();

  const base = explainMarche(referentiel, marche);
  if (!base) {
    const validIds = allMarcheIds(referentiel).join(", ");
    throw new UsageError(`Marche inconnue : "${marche}". Marches valides : ${validIds}.`);
  }

  if (profilePath === undefined) {
    process.stdout.write(formatExplanation(base));
    return;
  }

  const profileAbs = resolve(profilePath);
  if (!existsSync(profileAbs)) {
    throw new UsageError(`Chemin de profil inexistant : ${profilePath}`);
  }
  if (!statSync(profileAbs).isDirectory()) {
    throw new UsageError(`Chemin de profil invalide : ${profilePath} n'est pas un dossier.`);
  }

  const subjectId = sanitizeSubject(deriveProvisionalSubjectId(profileAbs, basename(profileAbs)));
  const outcome = runAnalysis(profileAbs, subjectId, { includeExperimentalLlm: true });
  const explanation = explainMarcheForProfile(base, outcome, subjectId);
  process.stdout.write(formatExplanation(explanation));
}

const COMMANDER_ERROR_LABELS: Record<string, string> = {
  "commander.unknownOption": "option inconnue",
  "commander.unknownCommand": "commande inconnue",
  "commander.missingArgument": "argument manquant",
  "commander.excessArguments": "trop d'arguments",
  "commander.invalidArgument": "argument invalide",
  "commander.optionMissingArgument": "valeur d'option manquante",
  "commander.missingMandatoryOptionValue": "option obligatoire manquante",
  "commander.conflictingOption": "options en conflit",
};

/** Traduit une CommanderError (message anglais baked-in) en message français. */
function describeCommanderError(error: CommanderError): string {
  const detail = error.message.replace(/^error:\s*/i, "");
  const label = COMMANDER_ERROR_LABELS[error.code];
  return label ? `Usage invalide (${label}) : ${detail}` : `Usage invalide : ${detail}`;
}

function buildProgram(): Command {
  const program = new Command();
  // exitOverride() doit être appelé avant toute déclaration de sous-commande : les
  // sous-commandes héritent du callback au moment de leur création.
  program
    .name("recognaize")
    .description("Rang AI-Driven Development d'un profil de développeur, sur la grille laivel-up.")
    .exitOverride()
    // Commander écrit lui-même un message anglais sur stderr avant de lancer
    // exitOverride() ; on le réduit au silence pour ne laisser que le message
    // français produit par l'unique catch de ce fichier.
    .configureOutput({ writeErr: () => {} });

  program
    .command("analyze")
    .description("Analyse un dossier de profil et écrit result.json (et report.html).")
    .argument("<path>", "chemin du dossier de profil à analyser")
    // DEC-001 : toute capacité non couverte par un test ou une eval est
    // retirée avant le rendu — `--verbose` n'existe donc pas ici (une option
    // qui ne fait rien mais prétend faire quelque chose ment sur son propre
    // effet). `--json` reste la seule option de sortie documentée.
    .option("--out <dir>", "répertoire de sortie", "./recognaize-cli-out")
    .option("--json", "imprime uniquement le JSON du résultat sur stdout")
    .option("--mode <mode>", "force le mode d'analyse (profile)")
    .option("--as-of <date>", "date de référence, pour le déterminisme")
    .action((inputPath: string, options: AnalyzeOptions) => {
      runAnalyze(inputPath, options);
    });

  program
    .command("export")
    .description("Rend report.html à partir de données déjà jugées (--in), sans réanalyse.")
    .requiredOption("--in <file>", "chemin du fichier JSON d'entrée (document jugé + agentic_context optionnel)")
    .requiredOption("--out <dir>", "répertoire de sortie")
    .option("--profile-dir <dir>", "dossier de profil, pour dériver git-activity.json/sonar-measures.json (jamais declaratif.md)")
    .action((options: ExportOptions) => {
      runExport(options);
    });

  const checksCmd = program.command("checks").description("Inspecte le référentiel de vérification.");

  checksCmd
    .command("list")
    .description("Liste les marches du référentiel.")
    .action(() => {
      runChecksList();
    });

  checksCmd
    .command("explain")
    .description("Explique une marche du référentiel, seule ou pour un profil donné.")
    .argument("<marche>", "identifiant de la marche (ex. H4)")
    .argument("[profil]", "chemin d'un dossier de profil, pour une explication contextualisée")
    .action((marche: string, profil: string | undefined) => {
      runChecksExplain(marche, profil);
    });

  return program;
}

try {
  buildProgram().parse(process.argv);
  process.exitCode = EXIT_SUCCESS;
} catch (error) {
  if (error instanceof CommanderError) {
    if (error.exitCode === 0) {
      // --help / --version : affichage normal, pas une erreur.
      process.exitCode = EXIT_SUCCESS;
    } else {
      process.stderr.write(`${describeCommanderError(error)}\n`);
      process.exitCode = EXIT_USAGE;
    }
  } else if (error instanceof UsageError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = EXIT_USAGE;
  } else if (error instanceof RefusedError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = EXIT_REFUSED;
  } else {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Erreur interne : ${detail}\n`);
    process.exitCode = EXIT_INTERNAL_ERROR;
  }
}
