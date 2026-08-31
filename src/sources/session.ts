/**
 * Adaptateur pour `session.md`. Digest déterministe et borné d'une session :
 * détection tolérante des tours à travers PLUSIEURS conventions d'en-tête
 * (`markdown-blocks.ts`), troncature à 600 tokens (approximés par `chars/4` —
 * aucune tokenisation réelle, déterministe, sans dépendance), séquence
 * d'outils priorisée sur la prose lors de la troncature. Aucune extraction de
 * signal ici (marches, symptômes, etc.) — c'est le travail de `lib/session-signals.ts`.
 *
 * Convention confirmée sur les 2 fixtures réelles
 * (`fixtures/profiles/{bohort,arthur}/session.md`) : `**Personne**` /
 * `**Assistant**`, une ligne entièrement en gras par tour, jamais de niveau de
 * titre. Le détecteur générique de `markdown-blocks.ts` reconnaît aussi
 * `**Human**` / `**AI**`, `### Tour N`, et toute autre paire de locuteurs en
 * gras alternés — voir ses tests pour les 4 variantes synthétiques.
 *
 * Structure non reconnue (aucune ligne en gras seule, aucun `### Tour N`) ⇒
 * digest vide + avertissement `no_recognized_turns`, jamais une exception —
 * même traitement qu'un fichier vide (0 tour détecté dans les deux cas).
 */

import { join } from "node:path";

import type { ProfileWarning } from "../core/types.js";
import { extractBracketLines, splitMarkdownBlocks, type MarkdownBlock, type MarkdownBlockConvention } from "./markdown-blocks.js";
import { readBoundedText } from "./read.js";
import { pieceWarning, type SourceResult } from "./tolerant-fields.js";

export const SESSION_FILE = "session.md";

/** ~600 tokens, approximés à 4 caractères/token. */
export const SESSION_DIGEST_TOKEN_BUDGET = 600;
export const SESSION_DIGEST_CHAR_BUDGET = SESSION_DIGEST_TOKEN_BUDGET * 4;

export type SessionRole = "humain" | "assistant" | "inconnu";

export interface SessionTurn {
  readonly index: number;
  readonly speaker: string;
  readonly role: SessionRole;
  readonly text: string;
  readonly toolCalls: readonly string[];
}

export interface SessionDigest {
  readonly turnCount: number;
  readonly convention: MarkdownBlockConvention;
  /** Toutes les lignes-outils détectées, dans l'ordre du fichier (avant troncature). */
  readonly toolCalls: readonly string[];
  /** Extrait borné à {@link SESSION_DIGEST_CHAR_BUDGET} caractères, séquence d'outils d'abord. */
  readonly excerpt: string;
  readonly truncated: boolean;
}

export type SessionResult = SourceResult<SessionDigest>;

const HUMAN_LABELS = new Set([
  "personne",
  "human",
  "humain",
  "utilisateur",
  "user",
  "dev",
  "developpeur",
]);
const ASSISTANT_LABELS = new Set([
  "assistant",
  "ai",
  "ia",
  "copilot",
  "modele",
  "bot",
  "claude",
  "gemini",
]);

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function inferRole(label: string): SessionRole {
  const key = stripAccents(label.trim().toLowerCase());
  if (HUMAN_LABELS.has(key)) {
    return "humain";
  }
  if (ASSISTANT_LABELS.has(key)) {
    return "assistant";
  }
  return "inconnu";
}

function buildTurns(blocks: readonly MarkdownBlock[]): readonly SessionTurn[] {
  return blocks.map((block, index) => ({
    index,
    speaker: block.label,
    role: inferRole(block.label),
    text: block.body,
    toolCalls: extractBracketLines(block.body),
  }));
}

interface TruncationResult {
  readonly excerpt: string;
  readonly truncated: boolean;
  readonly toolCalls: readonly string[];
}

/**
 * Concatène séquence d'outils PUIS prose des tours, dans cet ordre — priorité
 * garantie à la séquence d'outils lors de la troncature puisqu'elle est
 * toujours placée en tête du budget de caractères.
 */
function truncateDigest(turns: readonly SessionTurn[]): TruncationResult {
  const toolCalls = turns.flatMap((turn) => turn.toolCalls);
  const proseBlocks = turns
    .filter((turn) => turn.text.length > 0)
    .map((turn) => `${turn.speaker}: ${turn.text}`);
  const orderedBlocks = [...toolCalls, ...proseBlocks];
  const fullText = orderedBlocks.join("\n");

  if (fullText.length <= SESSION_DIGEST_CHAR_BUDGET) {
    return { excerpt: fullText, truncated: false, toolCalls };
  }

  const parts: string[] = [];
  let used = 0;
  for (const block of orderedBlocks) {
    if (used >= SESSION_DIGEST_CHAR_BUDGET) {
      break;
    }
    const remaining = SESSION_DIGEST_CHAR_BUDGET - used;
    if (block.length <= remaining) {
      parts.push(block);
      used += block.length + 1; // +1 pour le séparateur de jointure
    } else {
      parts.push(block.slice(0, remaining));
      used = SESSION_DIGEST_CHAR_BUDGET;
    }
  }
  return { excerpt: parts.join("\n"), truncated: true, toolCalls };
}

export function loadSession(profileDirAbs: string): SessionResult {
  const filePath = join(profileDirAbs, SESSION_FILE);
  const read = readBoundedText(profileDirAbs, filePath);
  if (!read.ok) {
    return { ok: false, warning: read.warning };
  }

  const warnings: ProfileWarning[] = [];
  const split = splitMarkdownBlocks(read.data);

  if (split.convention === "unrecognized" || split.blocks.length === 0) {
    warnings.push(
      pieceWarning(
        SESSION_FILE,
        "no_recognized_turns",
        "aucune structure de tour reconnue (ni **Locuteur**, ni ### Tour N) — digest vide.",
      ),
    );
    return {
      ok: true,
      data: { turnCount: 0, convention: "unrecognized", toolCalls: [], excerpt: "", truncated: false },
      warnings,
    };
  }

  const turns = buildTurns(split.blocks);
  const { excerpt, truncated, toolCalls } = truncateDigest(turns);

  return {
    ok: true,
    data: { turnCount: turns.length, convention: split.convention, toolCalls, excerpt, truncated },
    warnings,
  };
}
