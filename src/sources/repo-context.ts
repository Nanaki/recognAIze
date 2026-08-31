/**
 * Adaptateur pour `repo-context/`. Inventaire TOOL-AGNOSTIQUE (spec
 * « Neutralité d'outil ») et insensible à la casse des artefacts de harness
 * reconnus quel que soit l'assistant, classés en 9 catégories, avec détecteur
 * de spécificité (≥2 indices/4) et détecteur d'usage (référencé par
 * l'identité, modifié dans la fenêtre, cité en session).
 *
 * Classement en 9 catégories : « identité, mémoire, règle, skill, agent,
 * hook, deny-list, prompt, capitalisation ». « capitalisation » est un concept
 * réel du domaine (`RC.capitalization_artifact_specific_count`, marche O3),
 * pas une coquille. « mémoire » désigne le contexte VIVANT rechargé en
 * routine (`aidd_docs/memory/`, `docs/context/`, `docs/memory-bank/`) ;
 * « capitalisation » désigne l'archive de décisions/specs/plans déjà tranchés
 * (`aidd_docs/tasks/`, `docs/decisions/`, `docs/adr/`, `docs/specs/`,
 * `docs/plans/`) — distinction cohérente avec le sens français usuel de
 * « capitaliser » (une décision, un apprentissage). `.claude/settings.json`
 * est classé « deny-list » (son contenu le plus pertinent pour ce chemin jury
 * est `permissions.deny`), pas « capitalisation ».
 *
 * Détecteur de spécificité, indice « chemin plausible » : « chemin plausible »
 * ≠ « le chemin doit exister sur disque » (aucune vérification filesystem).
 * Ce module la détecte donc PUREMENT structurellement — un token en forme de
 * chemin (segments `/`, extension de fichier connue OU `/` final) trouvé
 * n'importe où dans le texte — INDÉPENDAMMENT de l'indice « élément de la
 * stack nommé », qui est son propre indice distinct : les coupler rendrait
 * l'un des deux indices structurellement redondant avec l'autre, alors que ce
 * sont deux indices SÉPARÉS parmi les 4.
 *
 * `node_modules/` toujours sauté : ce module ne fait JAMAIS de parcours
 * générique de `repo-context/` — il ne résout QUE les chemins connus listés
 * ci-dessous (`AGENTS.md`, `.claude/rules`, `docs/specs`, etc.), chacun résolu
 * insensible à la casse. Un `node_modules/` (ou tout autre dossier) situé à la
 * racine de `repo-context/`, ou n'importe où hors de la liste connue, n'est
 * donc JAMAIS visité — pas de liste d'exclusion par nom à maintenir, cohérent
 * avec « ce qui compte est ce qui est en place » (seuls les emplacements
 * reconnus du harness sont inventoriés). `readTextTreeBounded` reste
 * responsable de sauter les images/binaires et de borner chaque
 * sous-arborescence connue effectivement parcourue (`.claude/rules/`,
 * `.claude/skills/`, …) — voir `test/sources/repo-context.test.ts`.
 *
 * Budget de 200 fichiers texte PARTAGÉ : `repo-context/` est bornée comme UNE
 * arborescence à 200 fichiers texte, pas 200 par sous-dossier connu. Ce
 * module décrémente donc un compteur unique au fil des appels à
 * `readTextTreeBounded` pour chaque emplacement connu de type dossier, dans
 * l'ordre déclaré de `KNOWN_NESTED_DIRS` — déterministe, ne dépend d'aucun
 * ordre du système de fichiers.
 */

import { join, relative } from "node:path";

import type { AsOfWindow } from "../core/as-of.js";
import type { ProfileWarning } from "../core/types.js";
import { MAX_TEXT_FILES_PER_TREE, readBoundedText, readTextTreeBounded, readdirSorted } from "./read.js";
import { pieceWarning, type SourceResult } from "./tolerant-fields.js";

export const REPO_CONTEXT_DIR = "repo-context";

export type ArtifactCategory =
  | "identite"
  | "memoire"
  | "regle"
  | "skill"
  | "agent"
  | "hook"
  | "deny-list"
  | "prompt"
  | "capitalisation";

export type SpecificityHint = "path_plausible" | "stack_named" | "long_enough" | "imperative_rule";
export type UsageHint = "referenced_by_identity" | "modified_in_window" | "cited_in_session";

export interface RepoContextArtifact {
  /** Chemin relatif au dossier de profil analysé, casse telle que trouvée sur disque (ex. `repo-context/.claude/rules/fiabilite.md`). */
  readonly relPath: string;
  readonly category: ArtifactCategory;
  /** Lignes non vides, hors titres markdown (`#`…`######`). */
  readonly lineCount: number;
  readonly specific: boolean;
  readonly specificityHints: readonly SpecificityHint[];
  readonly used: boolean;
  readonly usageHints: readonly UsageHint[];
}

export interface RepoContextData {
  readonly artifacts: readonly RepoContextArtifact[];
}

export type RepoContextResult = SourceResult<RepoContextData>;

export interface RepoContextOptions {
  /** `profile.json`.`stack` — pour l'indice « élément de la stack nommé ». Défaut `[]` (l'indice ne se déclenche jamais). */
  readonly stack?: readonly string[];
  /** Fenêtre d'analyse (`core/as-of.ts`) — pour l'indice d'usage « modifié dans la fenêtre ». */
  readonly window?: AsOfWindow;
  /** `git-activity.json`.`context_files.last_updated` — seul horodatage disponible, commun à tous les artefacts (pas de mtime par fichier, non déterministe). */
  readonly contextFilesLastUpdated?: string | null;
  /** Texte de `session.md` (brut ou digest) — pour l'indice d'usage « cité en session ». */
  readonly sessionText?: string;
}

interface RootFileSpec {
  readonly name: string;
  readonly category: ArtifactCategory;
}

/** Fichiers nommés directement à la racine de `repo-context/`. */
const KNOWN_ROOT_FILES: readonly RootFileSpec[] = [
  { name: "AGENTS.md", category: "identite" },
  { name: "CLAUDE.md", category: "identite" },
  { name: "GEMINI.md", category: "identite" },
  { name: ".cursorrules", category: "regle" },
  { name: ".windsurfrules", category: "regle" },
  { name: ".clinerules", category: "regle" },
];

interface NestedFileSpec {
  readonly relPath: string;
  readonly category: ArtifactCategory;
}

/** Fichiers nommés, imbriqués sous un sous-dossier connu de `repo-context/`. */
const KNOWN_NESTED_FILES: readonly NestedFileSpec[] = [
  { relPath: ".github/copilot-instructions.md", category: "identite" },
  { relPath: ".claude/settings.json", category: "deny-list" },
];

interface NestedDirSpec {
  readonly relPath: string;
  readonly category: ArtifactCategory;
}

/** Dossiers connus — inventoriés en entier (bornés), un artefact par fichier texte trouvé dedans. */
const KNOWN_NESTED_DIRS: readonly NestedDirSpec[] = [
  { relPath: ".cursor/rules", category: "regle" },
  { relPath: ".claude/rules", category: "regle" },
  { relPath: ".claude/skills", category: "skill" },
  { relPath: ".claude/agents", category: "agent" },
  { relPath: ".claude/hooks", category: "hook" },
  { relPath: ".github/instructions", category: "regle" },
  { relPath: ".github/prompts", category: "prompt" },
  { relPath: ".github/agents", category: "agent" },
  { relPath: ".github/hooks", category: "hook" },
  { relPath: "aidd_docs/memory", category: "memoire" },
  { relPath: "aidd_docs/tasks", category: "capitalisation" },
  { relPath: "docs/context", category: "memoire" },
  { relPath: "docs/memory-bank", category: "memoire" },
  { relPath: "docs/decisions", category: "capitalisation" },
  { relPath: "docs/adr", category: "capitalisation" },
  { relPath: "docs/specs", category: "capitalisation" },
  { relPath: "docs/plans", category: "capitalisation" },
];

/**
 * Résout `relPath` (segments séparés par `/`) sous `baseAbs`, en comparant
 * chaque segment insensible à la casse contre les entrées réelles du disque —
 * jamais d'exception (un segment intermédiaire absent ⇒ `undefined`, silence :
 * absence normale d'un emplacement optionnel du harness, pas une erreur).
 */
function resolveCaseInsensitivePath(baseAbs: string, relPath: string): string | undefined {
  const segments = relPath.split("/");
  let currentAbs = baseAbs;
  for (const segment of segments) {
    let entries: string[];
    try {
      entries = readdirSorted(currentAbs);
    } catch {
      return undefined;
    }
    const lower = segment.toLowerCase();
    const found = entries.find((entry) => entry.toLowerCase() === lower);
    if (found === undefined) {
      return undefined;
    }
    currentAbs = `${currentAbs}/${found}`;
  }
  return currentAbs;
}

function countUsefulLines(text: string): number {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return false;
      }
      return !/^#{1,6}(\s|$)/.test(trimmed);
    }).length;
}

const IMPERATIVE_PATTERNS: readonly RegExp[] = [
  /\bne\b[^.\n]{0,80}\bjamais\b/i,
  /\btoujours\b/i,
  /\bmust\b/i,
  /\bnever\b/i,
];

function hasImperativeRule(text: string): boolean {
  return IMPERATIVE_PATTERNS.some((pattern) => pattern.test(text));
}

const PATH_TOKEN_RE = /[`"']?((?:[\w.-]+\/){1,}[\w.-]*)[`"']?/g;
const KNOWN_EXTENSION_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|md|mdx|json|yaml|yml|toml|sql|css|scss|html)$/i;

/** Chemin PLAUSIBLE : token en forme de chemin (≥1 segment `/`) se terminant par `/` (dossier) ou une extension connue — aucune vérification disque. */
function hasPlausiblePath(text: string): boolean {
  const matches = text.match(PATH_TOKEN_RE);
  if (matches === null) {
    return false;
  }
  return matches.some((raw) => {
    const cleaned = raw.replace(/[`"']/g, "");
    return cleaned.endsWith("/") || KNOWN_EXTENSION_RE.test(cleaned);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namesStackElement(text: string, stack: readonly string[]): boolean {
  return stack.some((item) => {
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      return false;
    }
    return new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "i").test(text);
  });
}

function computeSpecificity(
  text: string,
  stack: readonly string[],
): { readonly specific: boolean; readonly hints: readonly SpecificityHint[] } {
  const hints: SpecificityHint[] = [];
  if (hasPlausiblePath(text)) {
    hints.push("path_plausible");
  }
  if (namesStackElement(text, stack)) {
    hints.push("stack_named");
  }
  if (countUsefulLines(text) >= 10) {
    hints.push("long_enough");
  }
  if (hasImperativeRule(text)) {
    hints.push("imperative_rule");
  }
  return { specific: hints.length >= 2, hints };
}

function basenameOf(relPath: string): string {
  const idx = relPath.lastIndexOf("/");
  return idx === -1 ? relPath : relPath.slice(idx + 1);
}

function isModifiedInWindow(window: AsOfWindow | undefined, contextFilesLastUpdated: string | null | undefined): boolean {
  if (window === undefined) {
    return false;
  }
  if (contextFilesLastUpdated === null || contextFilesLastUpdated === undefined) {
    return false;
  }
  if (contextFilesLastUpdated.length < 10) {
    return false;
  }
  const day = contextFilesLastUpdated.slice(0, 10);
  return day >= window.from && day <= window.to;
}

function computeUsage(
  relPathWithinRepoContext: string,
  identityTexts: readonly string[],
  options: RepoContextOptions,
): { readonly used: boolean; readonly hints: readonly UsageHint[] } {
  const hints: UsageHint[] = [];
  const base = basenameOf(relPathWithinRepoContext);
  if (identityTexts.some((text) => text.includes(relPathWithinRepoContext) || text.includes(base))) {
    hints.push("referenced_by_identity");
  }
  if (isModifiedInWindow(options.window, options.contextFilesLastUpdated)) {
    hints.push("modified_in_window");
  }
  if (options.sessionText !== undefined && (options.sessionText.includes(relPathWithinRepoContext) || options.sessionText.includes(base))) {
    hints.push("cited_in_session");
  }
  return { used: hints.length > 0, hints };
}

interface BuiltEntry {
  /** Relatif au dossier de profil analysé (`profileDirAbs`) — casse telle que trouvée sur disque. */
  readonly relPath: string;
  /** Relatif à `repo-context/` lui-même — utilisé pour les indices d'usage (référencé par nom depuis l'identité/la session). */
  readonly relPathWithinRepoContext: string;
  readonly category: ArtifactCategory;
  readonly content: string;
}

export function loadRepoContext(profileDirAbs: string, options: RepoContextOptions = {}): RepoContextResult {
  const repoContextAbs = resolveCaseInsensitivePath(profileDirAbs, REPO_CONTEXT_DIR);
  if (repoContextAbs === undefined) {
    return {
      ok: false,
      warning: pieceWarning(REPO_CONTEXT_DIR, "read_error", "dossier repo-context/ introuvable."),
    };
  }

  const warnings: ProfileWarning[] = [];
  const built: BuiltEntry[] = [];

  for (const spec of KNOWN_ROOT_FILES) {
    const abs = resolveCaseInsensitivePath(repoContextAbs, spec.name);
    if (abs === undefined) {
      continue;
    }
    const read = readBoundedText(profileDirAbs, abs);
    if (!read.ok) {
      warnings.push(read.warning);
      continue;
    }
    built.push({
      relPath: relative(profileDirAbs, abs),
      relPathWithinRepoContext: relative(repoContextAbs, abs),
      category: spec.category,
      content: read.data,
    });
  }

  for (const spec of KNOWN_NESTED_FILES) {
    const abs = resolveCaseInsensitivePath(repoContextAbs, spec.relPath);
    if (abs === undefined) {
      continue;
    }
    const read = readBoundedText(profileDirAbs, abs);
    if (!read.ok) {
      warnings.push(read.warning);
      continue;
    }
    built.push({
      relPath: relative(profileDirAbs, abs),
      relPathWithinRepoContext: relative(repoContextAbs, abs),
      category: spec.category,
      content: read.data,
    });
  }

  let remainingCap = MAX_TEXT_FILES_PER_TREE;
  let capWarningEmitted = false;
  for (const spec of KNOWN_NESTED_DIRS) {
    if (remainingCap <= 0) {
      if (!capWarningEmitted) {
        warnings.push(
          pieceWarning(
            REPO_CONTEXT_DIR,
            "text_file_cap_reached",
            `plafond de ${MAX_TEXT_FILES_PER_TREE} fichiers texte atteint pour repo-context/ — reste de l'arborescence ignoré.`,
          ),
        );
        capWarningEmitted = true;
      }
      break;
    }
    const abs = resolveCaseInsensitivePath(repoContextAbs, spec.relPath);
    if (abs === undefined) {
      continue;
    }
    const treeResult = readTextTreeBounded(profileDirAbs, abs, remainingCap);
    remainingCap -= treeResult.files.length;
    for (const warning of treeResult.warnings) {
      warnings.push(warning);
      if (warning.code === "text_file_cap_reached") {
        capWarningEmitted = true;
      }
    }
    for (const file of treeResult.files) {
      built.push({
        relPath: file.relPath,
        relPathWithinRepoContext: relative(repoContextAbs, join(profileDirAbs, file.relPath)),
        category: spec.category,
        content: file.content,
      });
    }
  }

  built.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));

  const stack = options.stack ?? [];
  const identityTexts = built.filter((entry) => entry.category === "identite").map((entry) => entry.content);

  const artifacts: RepoContextArtifact[] = built.map((entry) => {
    const { specific, hints: specificityHints } = computeSpecificity(entry.content, stack);
    const usage = computeUsage(entry.relPathWithinRepoContext.split("\\").join("/"), identityTexts, options);
    return {
      relPath: entry.relPath,
      category: entry.category,
      lineCount: countUsefulLines(entry.content),
      specific,
      specificityHints,
      used: usage.used,
      usageHints: usage.hints,
    };
  });

  return { ok: true, data: { artifacts }, warnings };
}
