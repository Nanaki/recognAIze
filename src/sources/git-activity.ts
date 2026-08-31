/**
 * Adaptateur pour `git-activity.json`. Tolérant au champ près
 * (`.claude/rules/fiabilite.md`) : un champ PRÉSENT mais mal typé ou hors
 * bornes (`ai_coauthored_ratio: "0.91"` en chaîne, `size_distribution: null`,
 * `total: -1`) rend CE CHAMP inconnu, avec un avertissement le nommant — le
 * reste de l'objet reste exploité. Un champ simplement ABSENT ne produit aucun
 * avertissement (tolérance normale, esprit `.passthrough().partial()` — voir
 * la docstring de `tolerant-fields.ts` pour la distinction absent/invalide).
 *
 * Ratio hors `[0;1]` et total négatif ⇒ inconnu pour ce champ précis. Noms de
 * champs vérifiés directement contre les 4 fixtures réelles
 * (`fixtures/profiles/{bohort,arthur,leodagan,perceval}/git-activity.json`).
 */

import { join } from "node:path";

import type { ProfileWarning } from "../core/types.js";
import { readBoundedText } from "./read.js";
import {
  describeError,
  describeRaw,
  fieldWarning,
  isPlainObject,
  parseBooleanField,
  parseNonEmptyString,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  parseRatio01,
  parseStringArray,
  parseStringOrNull,
  pieceWarning,
  type SourceResult,
} from "./tolerant-fields.js";

export const GIT_ACTIVITY_FILE = "git-activity.json";

export interface GitActivityPeriod {
  readonly from?: string;
  readonly to?: string;
}

export interface GitActivitySizeDistribution {
  readonly xs?: number;
  readonly s?: number;
  readonly m?: number;
  readonly l?: number;
  readonly xl?: number;
}

export interface GitActivityPullRequests {
  readonly total?: number;
  readonly size_distribution?: GitActivitySizeDistribution;
  readonly median_files_changed?: number;
  readonly median_lines_changed?: number;
  readonly median_correction_commits_after_open?: number;
  readonly merged_without_human_edit_after_open?: number;
  readonly reverted?: number;
  readonly median_review_comments_received?: number;
}

export interface GitActivityCommits {
  readonly total?: number;
  readonly median_per_pr?: number;
  readonly ai_coauthored_ratio?: number;
  readonly message_convention_compliance?: number;
}

export interface GitActivityTests {
  readonly coverage_start?: number;
  readonly coverage_end?: number;
  readonly prs_with_tests_ratio?: number;
}

export interface GitActivityParallelism {
  readonly max_concurrent_branches?: number;
  readonly median_concurrent_branches?: number;
}

export interface GitActivityCi {
  readonly failure_rate?: number;
  readonly median_runs_to_green?: number;
}

export interface GitActivityContextFiles {
  readonly agents_md?: boolean;
  readonly rules_count?: number;
  readonly skills_count?: number;
  readonly hooks_count?: number;
  readonly agents_count?: number;
  readonly last_updated?: string | null;
}

export interface GitActivityAssistantUsage {
  readonly declared_tools?: readonly string[];
  readonly editor_integration?: boolean;
  readonly sessions_per_week?: number;
  readonly tokens_per_week?: number;
}

export interface GitActivityData {
  readonly period?: GitActivityPeriod;
  readonly repositories?: number;
  readonly pull_requests?: GitActivityPullRequests;
  readonly commits?: GitActivityCommits;
  readonly tests?: GitActivityTests;
  readonly parallelism?: GitActivityParallelism;
  readonly ci?: GitActivityCi;
  readonly context_files?: GitActivityContextFiles;
  readonly assistant_usage?: GitActivityAssistantUsage;
}

export type GitActivityResult = SourceResult<GitActivityData>;

function fieldLabel(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

/** Champ présent-mais-invalide ⇒ avertissement + `undefined` ; champ absent ⇒ silence. */
function extractField<T>(
  raw: Record<string, unknown>,
  key: string,
  parser: (raw: unknown) => T | undefined,
  path: string,
  file: string,
  warnings: ProfileWarning[],
): T | undefined {
  if (!(key in raw) || raw[key] === undefined) {
    return undefined;
  }
  const value = parser(raw[key]);
  if (value === undefined) {
    warnings.push(fieldWarning(file, fieldLabel(path, key), `reçu ${describeRaw(raw[key])}`));
    return undefined;
  }
  return value;
}

/**
 * Sous-objet présent-mais-invalide (`null`, tableau, scalaire) ⇒ UN avertissement
 * nommant la section entière, le reste du parent reste exploité (pas de bruit
 * champ par champ pour une section qui n'existe simplement pas).
 */
function extractSection<T>(
  raw: Record<string, unknown>,
  key: string,
  path: string,
  file: string,
  warnings: ProfileWarning[],
  build: (section: Record<string, unknown>, nestedPath: string) => T,
): T | undefined {
  if (!(key in raw) || raw[key] === undefined) {
    return undefined;
  }
  const value = raw[key];
  const label = fieldLabel(path, key);
  if (!isPlainObject(value)) {
    warnings.push(fieldWarning(file, label, `reçu ${describeRaw(value)}, objet attendu`));
    return undefined;
  }
  return build(value, label);
}

function buildSizeDistribution(
  section: Record<string, unknown>,
  path: string,
  file: string,
  warnings: ProfileWarning[],
): GitActivitySizeDistribution {
  return {
    xs: extractField(section, "xs", parseNonNegativeInteger, path, file, warnings),
    s: extractField(section, "s", parseNonNegativeInteger, path, file, warnings),
    m: extractField(section, "m", parseNonNegativeInteger, path, file, warnings),
    l: extractField(section, "l", parseNonNegativeInteger, path, file, warnings),
    xl: extractField(section, "xl", parseNonNegativeInteger, path, file, warnings),
  };
}

export function loadGitActivity(profileDirAbs: string): GitActivityResult {
  const filePath = join(profileDirAbs, GIT_ACTIVITY_FILE);
  const read = readBoundedText(profileDirAbs, filePath);
  if (!read.ok) {
    return { ok: false, warning: read.warning };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(read.data);
  } catch (err) {
    return {
      ok: false,
      warning: pieceWarning(GIT_ACTIVITY_FILE, "invalid_json", `JSON invalide : ${describeError(err)}`),
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      warning: pieceWarning(
        GIT_ACTIVITY_FILE,
        "not_object",
        `contenu top-level attendu objet, reçu ${describeRaw(parsed)}`,
      ),
    };
  }

  const warnings: ProfileWarning[] = [];
  const raw = parsed;
  const file = GIT_ACTIVITY_FILE;

  const period = extractSection(raw, "period", "", file, warnings, (section, path) => ({
    from: extractField(section, "from", parseNonEmptyString, path, file, warnings),
    to: extractField(section, "to", parseNonEmptyString, path, file, warnings),
  }));

  const repositories = extractField(raw, "repositories", parseNonNegativeInteger, "", file, warnings);

  const pullRequests = extractSection(raw, "pull_requests", "", file, warnings, (section, path) => ({
    total: extractField(section, "total", parseNonNegativeInteger, path, file, warnings),
    size_distribution: extractSection(section, "size_distribution", path, file, warnings, (sub, subPath) =>
      buildSizeDistribution(sub, subPath, file, warnings),
    ),
    median_files_changed: extractField(section, "median_files_changed", parseNonNegativeNumber, path, file, warnings),
    median_lines_changed: extractField(section, "median_lines_changed", parseNonNegativeNumber, path, file, warnings),
    median_correction_commits_after_open: extractField(
      section,
      "median_correction_commits_after_open",
      parseNonNegativeNumber,
      path,
      file,
      warnings,
    ),
    merged_without_human_edit_after_open: extractField(
      section,
      "merged_without_human_edit_after_open",
      parseNonNegativeInteger,
      path,
      file,
      warnings,
    ),
    reverted: extractField(section, "reverted", parseNonNegativeInteger, path, file, warnings),
    median_review_comments_received: extractField(
      section,
      "median_review_comments_received",
      parseNonNegativeNumber,
      path,
      file,
      warnings,
    ),
  }));

  const commits = extractSection(raw, "commits", "", file, warnings, (section, path) => ({
    total: extractField(section, "total", parseNonNegativeInteger, path, file, warnings),
    median_per_pr: extractField(section, "median_per_pr", parseNonNegativeNumber, path, file, warnings),
    ai_coauthored_ratio: extractField(section, "ai_coauthored_ratio", parseRatio01, path, file, warnings),
    message_convention_compliance: extractField(
      section,
      "message_convention_compliance",
      parseRatio01,
      path,
      file,
      warnings,
    ),
  }));

  const tests = extractSection(raw, "tests", "", file, warnings, (section, path) => ({
    coverage_start: extractField(section, "coverage_start", parseRatio01, path, file, warnings),
    coverage_end: extractField(section, "coverage_end", parseRatio01, path, file, warnings),
    prs_with_tests_ratio: extractField(section, "prs_with_tests_ratio", parseRatio01, path, file, warnings),
  }));

  const parallelism = extractSection(raw, "parallelism", "", file, warnings, (section, path) => ({
    max_concurrent_branches: extractField(
      section,
      "max_concurrent_branches",
      parseNonNegativeInteger,
      path,
      file,
      warnings,
    ),
    median_concurrent_branches: extractField(
      section,
      "median_concurrent_branches",
      parseNonNegativeNumber,
      path,
      file,
      warnings,
    ),
  }));

  const ci = extractSection(raw, "ci", "", file, warnings, (section, path) => ({
    failure_rate: extractField(section, "failure_rate", parseRatio01, path, file, warnings),
    median_runs_to_green: extractField(section, "median_runs_to_green", parseNonNegativeNumber, path, file, warnings),
  }));

  const contextFiles = extractSection(raw, "context_files", "", file, warnings, (section, path) => ({
    agents_md: extractField(section, "agents_md", parseBooleanField, path, file, warnings),
    rules_count: extractField(section, "rules_count", parseNonNegativeInteger, path, file, warnings),
    skills_count: extractField(section, "skills_count", parseNonNegativeInteger, path, file, warnings),
    hooks_count: extractField(section, "hooks_count", parseNonNegativeInteger, path, file, warnings),
    agents_count: extractField(section, "agents_count", parseNonNegativeInteger, path, file, warnings),
    last_updated: extractField(section, "last_updated", parseStringOrNull, path, file, warnings),
  }));

  const assistantUsage = extractSection(raw, "assistant_usage", "", file, warnings, (section, path) => ({
    declared_tools: extractField(section, "declared_tools", parseStringArray, path, file, warnings),
    editor_integration: extractField(section, "editor_integration", parseBooleanField, path, file, warnings),
    sessions_per_week: extractField(section, "sessions_per_week", parseNonNegativeInteger, path, file, warnings),
    tokens_per_week: extractField(section, "tokens_per_week", parseNonNegativeInteger, path, file, warnings),
  }));

  return {
    ok: true,
    data: {
      period,
      repositories,
      pull_requests: pullRequests,
      commits,
      tests,
      parallelism,
      ci,
      context_files: contextFiles,
      assistant_usage: assistantUsage,
    },
    warnings,
  };
}
