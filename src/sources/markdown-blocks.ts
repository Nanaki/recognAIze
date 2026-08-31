/**
 * Découpage tolérant d'un texte markdown en blocs délimités par un en-tête de
 * tour ou de question — partagé par `session.ts` et `declaratif.ts`.
 *
 * Deux conventions reconnues, dans cet ordre de priorité :
 * 1. `bold_header` — toute ligne qui, une fois recadrée (`trim()`), est
 *    ENTIÈREMENT `**Label**` et rien d'autre. Couvre `**Personne**` /
 *    `**Assistant**` (les deux fixtures réelles,
 *    `fixtures/profiles/{bohort,arthur}/session.md`), `**Human**` / `**AI**`,
 *    et plus généralement TOUTE paire de locuteurs en gras alternés
 *    (`**Dev**` / `**Copilot**`, etc.) ainsi que les questions du
 *    questionnaire déclaratif (`**Quel est ton niveau selon toi ?**`).
 * 2. `tour_header` — `### Tour N` (ou tout niveau de titre `#`-`######`),
 *    avec un label optionnel après un séparateur (`### Tour 2 — Assistant`
 *    capture `"Assistant"` ; `### Tour 2` seul capture `""`). Repli utilisé
 *    UNIQUEMENT si aucune ligne en gras seule n'a été trouvée dans tout le
 *    texte — les deux conventions ne sont jamais mélangées dans un même
 *    fichier par ce détecteur.
 *
 * Aucune des deux structures reconnue ⇒ `{convention:"unrecognized", blocks:
 * []}`, jamais une exception — à l'appelant (`session.ts`) de décider du
 * digest vide + avertissement, à `declaratif.ts` de décider « non renseigné ».
 */

const BOLD_HEADER_RE = /^\*\*([^*\n]{1,120})\*\*$/;
const TOUR_HEADER_RE = /^#{1,6}\s*Tour\s+\d+\b\s*[:\-—]?\s*(.*)$/i;

export interface MarkdownBlock {
  /** Texte du label, sans les `**` ni le `### Tour N` — `trim()`. */
  readonly label: string;
  /** Texte jusqu'au prochain en-tête (ou fin de fichier) — `trim()`. */
  readonly body: string;
}

export type MarkdownBlockConvention = "bold_header" | "tour_header" | "unrecognized";

export interface MarkdownBlockSplit {
  readonly convention: MarkdownBlockConvention;
  readonly blocks: readonly MarkdownBlock[];
}

function splitByHeaderRegex(text: string, re: RegExp): MarkdownBlock[] | undefined {
  const lines = text.split("\n");
  const headers: Array<{ readonly line: number; readonly label: string }> = [];
  lines.forEach((line, index) => {
    const match = re.exec(line.trim());
    if (match !== null) {
      headers.push({ line: index, label: (match[1] ?? "").trim() });
    }
  });
  if (headers.length === 0) {
    return undefined;
  }
  const blocks: MarkdownBlock[] = [];
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i]!;
    const start = header.line + 1;
    const end = i + 1 < headers.length ? headers[i + 1]!.line : lines.length;
    blocks.push({ label: header.label, body: lines.slice(start, end).join("\n").trim() });
  }
  return blocks;
}

/** Ne lève jamais — un texte vide ou sans structure reconnue rend `{convention:"unrecognized", blocks:[]}`. */
export function splitMarkdownBlocks(text: string): MarkdownBlockSplit {
  const bold = splitByHeaderRegex(text, BOLD_HEADER_RE);
  if (bold !== undefined) {
    return { convention: "bold_header", blocks: bold };
  }
  const tour = splitByHeaderRegex(text, TOUR_HEADER_RE);
  if (tour !== undefined) {
    return { convention: "tour_header", blocks: tour };
  }
  return { convention: "unrecognized", blocks: [] };
}

/**
 * Lignes ENTIÈREMENT entre crochets (`[9 tests écrits, tous en échec]`) —
 * séquence d'outils/actions d'un tour, distincte de la prose. `session.ts` les
 * priorise lors de la troncature à 600 tokens.
 */
export function extractBracketLines(body: string): readonly string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\[.+\]$/.test(line));
}
