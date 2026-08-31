/**
 * Rendu Markdown → HTML, borné au sous-ensemble RÉELLEMENT utilisé par
 * `docs/referentiel.md` (donc par `concept.detail`, régénéré depuis ce
 * fichier par `scripts/gen-concept-details.ts`) : paragraphes, **gras**,
 * `code inline`, et tableaux à pipes (ligne d'en-tête + ligne de séparateur
 * `---`). Rien d'autre n'existe dans la source (vérifié — pas de liste à
 * puces, pas de citation `>`, pas de lien `[texte](url)`, pas d'italique
 * simple-étoile/underscore réel, les underscores observés appartiennent tous
 * à des identifiants dans du code inline) : pas de dépendance à une
 * bibliothèque Markdown complète pour ce besoin fixe et connu.
 *
 * Ce module convertit réellement la syntaxe Markdown en balises HTML (jamais
 * un simple échappement affiché dans un `<pre>`) ; {@link renderConceptDetailHtml}
 * reste l'unique point d'entrée, appelé par `src/report/html.ts`.
 *
 * Sécurité : {@link esc} (`./esc.ts`) échappe TOUJOURS le texte brut d'un
 * span AVANT toute substitution de balise ({@link renderInlineMd}) — les
 * balises `<strong>`/`<code>`/`<table>`/... introduites ici sont toutes des
 * constantes de ce module, jamais dérivées du contenu recopié. `esc()`
 * n'échappe ni le backtick ni l'astérisque : ils restent donc littéraux et
 * détectables par les expressions régulières APRÈS l'échappement — aucune
 * chaîne du profil ou du référentiel n'atteint jamais le HTML final sans
 * être passée par `esc()` en premier, donc aucun second moteur de rendu Markdown
 * complet (et sa surface d'injection) à maintenir ou faire confiance.
 */

import { esc } from "./esc.js";

/** Une ligne de séparateur de tableau (ex. `| --- | --- |`, ou `|:---|---:|`). */
function isSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

/** Découpe une ligne de tableau à pipes en cellules, en retirant les pipes de bord. */
function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

/** Un bloc est un tableau si sa 1re ligne contient un `|` et sa 2e est une ligne de séparateur. */
function isTableBlock(lines: readonly string[]): boolean {
  return lines.length >= 2 && lines[0].includes("|") && isSeparatorRow(lines[1]);
}

/**
 * Rend le texte d'un span (cellule de tableau ou paragraphe) : échappe
 * D'ABORD tout le texte brut via {@link esc}, PUIS remplace `` `code` `` et
 * `**gras**` par leurs balises — jamais l'inverse (voir la note de sécurité en
 * tête de fichier).
 */
function renderInlineMd(raw: string): string {
  const escaped = esc(raw);
  const withCode = escaped.replace(/`([^`]+)`/g, (_match, code: string) => `<code>${code}</code>`);
  return withCode.replace(/\*\*([^*]+)\*\*/g, (_match, bold: string) => `<strong>${bold}</strong>`);
}

function renderTableBlock(lines: readonly string[]): string {
  const header = splitTableRow(lines[0]);
  const bodyRows = lines
    .slice(2)
    .filter((line) => line.trim().length > 0)
    .map(splitTableRow);
  const thead = `<thead><tr>${header.map((cell) => `<th>${renderInlineMd(cell)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMd(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table class="concept-detail__table">${thead}${tbody}</table>`;
}

function renderParagraphBlock(lines: readonly string[]): string {
  const text = lines.map((line) => line.trim()).join(" ");
  return `<p>${renderInlineMd(text)}</p>`;
}

/** Sépare un texte en blocs délimités par une ou plusieurs lignes vides (règle Markdown standard de paragraphe). */
function splitBlocks(raw: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/**
 * Convertit `concept.detail` (texte Markdown borné — voir l'en-tête de ce
 * fichier) en HTML échappé et prêt à interpoler tel quel dans le gabarit de
 * `src/report/html.ts`. PURE : aucune E/S, aucune horloge.
 */
export function renderConceptDetailHtml(raw: string): string {
  return splitBlocks(raw)
    .map((block) => (isTableBlock(block) ? renderTableBlock(block) : renderParagraphBlock(block)))
    .join("\n");
}
