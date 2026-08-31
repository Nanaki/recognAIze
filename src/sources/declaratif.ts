/**
 * Adaptateur pour `declaratif.md`. Questionnaire libre auto-rapporté
 * (`fixtures/profiles/{perceval,bohort,leodagan}/declaratif.md` — `arthur` n'a
 * pas répondu, pas de fichier). Réutilise le même détecteur de blocs en gras
 * que `session.ts` (`markdown-blocks.ts`) : chaque question
 * (`**Quel est ton niveau selon toi ?**`) devient un bloc, sa réponse le corps
 * qui suit jusqu'à la prochaine question.
 *
 * Contrat DEC-004 (`aidd_docs/memory/architecture.md`) : la source `DEC` a une
 * `confiance_source` figée à 0 — un déclaratif ne prouve ni n'infirme jamais
 * seul. Ce module se contente de DÉTECTER et de FLAGUER les symptômes et
 * indices négatifs ; l'interprétation (juger, pondérer, croiser avec d'autres
 * sources) est hors périmètre, réservée au juge.
 *
 * Fichier absent ⇒ `{ok:false, warning}` (comme toute pièce nommée absente,
 * `read.ts`). Fichier présent mais SANS réponse exploitable (aucun bloc, ou
 * tous les corps vides) ⇒ `{ok:true, data:{answered:false, ...}}`, jamais une
 * erreur — « non renseigné ».
 */

import { join } from "node:path";

import type { ProfileWarning } from "../core/types.js";
import { splitMarkdownBlocks } from "./markdown-blocks.js";
import { readBoundedText } from "./read.js";
import { pieceWarning, type SourceResult } from "./tolerant-fields.js";

export const DECLARATIF_FILE = "declaratif.md";

export interface DeclaratifQA {
  readonly question: string;
  readonly answer: string;
}

export interface DeclaratifSymptom {
  readonly id: string;
  readonly label: string;
  /** Extraits (une ligne par motif déclenché) servant de citation. */
  readonly quotes: readonly string[];
}

/**
 * Indice négatif déclaratif (absence déclarée d'une pratique). `confianceSource`
 * figé à `0` (type littéral) — ne prouve ni n'infirme jamais seul, voir
 * l'en-tête de ce fichier et DEC-004.
 */
export interface DeclaratifNegativeHint {
  readonly id: string;
  readonly label: string;
  readonly quote: string;
  readonly confianceSource: 0;
}

export interface DeclaratifData {
  readonly answered: boolean;
  readonly qas: readonly DeclaratifQA[];
  /** Réponse libre à la question de niveau auto-estimé, si une question la citant a été trouvée et répondue. */
  readonly selfEstimatedLevel?: string;
  readonly symptoms: readonly DeclaratifSymptom[];
  readonly negativeHints: readonly DeclaratifNegativeHint[];
}

export type DeclaratifResult = SourceResult<DeclaratifData>;

interface SymptomRule {
  readonly id: string;
  readonly label: string;
  readonly patterns: readonly RegExp[];
}

/**
 * « il oublie ce qu'on s'est dit » et « il réinvente des trucs qui existent »
 * relèvent toutes deux du même symptôme « manque de contexte » — vérifié sur
 * `fixtures/profiles/perceval/declaratif.md` (réponse « Un truc qui te
 * frustre ? »), qui contient littéralement les deux phrases.
 */
const SYMPTOM_RULES: readonly SymptomRule[] = [
  {
    id: "manque_de_contexte",
    label: "manque de contexte",
    patterns: [/il oublie ce qu'on s'est dit/i, /il r[ée]invente des trucs qui existent/i],
  },
];

interface NegativeHintRule {
  readonly id: string;
  readonly label: string;
  readonly pattern: RegExp;
}

/**
 * « un fil à la fois » (travail single-threaded) — indice négatif pour P2
 * (parallélisme) ; vérifié sur `fixtures/profiles/leodagan/declaratif.md`
 * (« En parallèle, non : un fil à la fois. »). Toujours enregistré si la
 * phrase est présente, SANS vérifier ailleurs si une trace de P2 existe — ce
 * croisement est le travail du juge, pas de cet adaptateur.
 */
const NEGATIVE_HINT_RULES: readonly NegativeHintRule[] = [
  {
    id: "single_threaded_declared",
    label: "déclare travailler un fil à la fois (indice négatif P2 — ne prouve ni n'infirme seul)",
    pattern: /un fil (?:à|a) la fois/i,
  },
];

const LEVEL_QUESTION_RE = /niveau/i;

function findQuoteLine(text: string, pattern: RegExp): string {
  const lines = text.split(/\n+/);
  for (const line of lines) {
    if (pattern.test(line)) {
      return line.trim();
    }
  }
  return text.trim().slice(0, 160);
}

export function loadDeclaratif(profileDirAbs: string): DeclaratifResult {
  const filePath = join(profileDirAbs, DECLARATIF_FILE);
  const read = readBoundedText(profileDirAbs, filePath);
  if (!read.ok) {
    return { ok: false, warning: read.warning };
  }

  const warnings: ProfileWarning[] = [];
  const split = splitMarkdownBlocks(read.data);
  const qas: DeclaratifQA[] = split.blocks
    .map((block) => ({ question: block.label, answer: block.body.trim() }))
    .filter((qa) => qa.question.length > 0);

  const answeredQas = qas.filter((qa) => qa.answer.length > 0);
  const answered = answeredQas.length > 0;

  if (!answered) {
    warnings.push(
      pieceWarning(DECLARATIF_FILE, "not_answered", "aucune réponse exploitable — « non renseigné »."),
    );
    return { ok: true, data: { answered: false, qas, symptoms: [], negativeHints: [] }, warnings };
  }

  const fullText = answeredQas.map((qa) => qa.answer).join("\n");

  const levelQa = answeredQas.find((qa) => LEVEL_QUESTION_RE.test(qa.question));
  const selfEstimatedLevel = levelQa?.answer;

  const symptoms: DeclaratifSymptom[] = [];
  for (const rule of SYMPTOM_RULES) {
    const matchedPatterns = rule.patterns.filter((pattern) => pattern.test(fullText));
    if (matchedPatterns.length > 0) {
      symptoms.push({
        id: rule.id,
        label: rule.label,
        quotes: matchedPatterns.map((pattern) => findQuoteLine(fullText, pattern)),
      });
    }
  }

  const negativeHints: DeclaratifNegativeHint[] = [];
  for (const rule of NEGATIVE_HINT_RULES) {
    if (rule.pattern.test(fullText)) {
      negativeHints.push({
        id: rule.id,
        label: rule.label,
        quote: findQuoteLine(fullText, rule.pattern),
        confianceSource: 0,
      });
    }
  }

  return { ok: true, data: { answered: true, qas, selfEstimatedLevel, symptoms, negativeHints }, warnings };
}
