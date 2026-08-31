#!/usr/bin/env -S npx tsx
/**
 * Régénère les champs `detail` et `lien` de `src/referentiel/concepts.json`
 * par extraction statique de `docs/referentiel.md` — tourne en `prebuild`
 * (`npm run build` / `npm run concepts:generate`), même précédent que
 * `scripts/gen-checks-index.ts`.
 *
 * Le référentiel est rendu INLINE dans `report.html` lui-même plutôt que lié
 * vers `docs/referentiel.md` : `report.html` est écrit sous
 * `recognaize-cli-out/<sujet>/`, où `docs/` n'existe jamais (jamais copié) — un
 * lien relatif vers ce fichier serait donc mort à 100% des générations.
 * `lien` est donc une ancre SUR LA MÊME PAGE (`#concept-<marche>`, ex.
 * `#concept-h4`), et `detail` porte le texte de la section `### <marche>` de
 * `docs/referentiel.md` (tableau de seuils/preuves + contre-preuve compris),
 * que `src/report/html.ts` rend dans une section d'annexe portant cette même
 * ancre.
 *
 * Seuls `lien` et `detail` sont RÉGÉNÉRÉS ici — `marche` et `description`
 * (texte éditorial plus digeste que la prose de `docs/referentiel.md`,
 * affiché tel quel sur chaque carte de marche) restent HORS PÉRIMÈTRE de ce
 * script, lus tels quels depuis le fichier existant et recopiés sans
 * modification.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(here, "..");
const referentielDocPath = join(repoRoot, "docs", "referentiel.md");
const conceptsPath = join(repoRoot, "src", "referentiel", "concepts.json");

interface ConceptEntryOnDisk {
  readonly marche: string;
  readonly description: string;
  readonly lien: string;
  readonly detail?: string;
}

const MARCHE_HEADING_RE = /^### ([A-Z]\d+)\s*$/;
const BOUNDARY_RE = /^(##\s|---\s*$)/;

/** Extrait, pour chaque marche `### <ID>`, le texte compris jusqu'à la prochaine limite de section (`## `, `---`, ou fin de fichier). */
function extractConceptDetails(markdown: string): Map<string, string> {
  const lines = markdown.split("\n");
  const details = new Map<string, string>();

  let currentId: string | undefined;
  let currentLines: string[] = [];

  function flush(): void {
    if (currentId !== undefined) {
      details.set(currentId, currentLines.join("\n").trim());
    }
    currentLines = [];
  }

  for (const line of lines) {
    const headingMatch = MARCHE_HEADING_RE.exec(line);
    if (headingMatch) {
      flush();
      currentId = headingMatch[1];
      continue;
    }
    if (currentId !== undefined && BOUNDARY_RE.test(line)) {
      flush();
      currentId = undefined;
      continue;
    }
    if (currentId !== undefined) {
      currentLines.push(line);
    }
  }
  flush();

  return details;
}

function main(): void {
  const markdown = readFileSync(referentielDocPath, "utf8");
  const details = extractConceptDetails(markdown);

  const existing = JSON.parse(readFileSync(conceptsPath, "utf8")) as readonly ConceptEntryOnDisk[];

  const updated: ConceptEntryOnDisk[] = existing.map((entry) => {
    const detail = details.get(entry.marche);
    if (detail === undefined || detail.length === 0) {
      throw new Error(
        `[gen-concept-details] aucune section "### ${entry.marche}" trouvée (ou vide) dans docs/referentiel.md — concepts.json non régénéré.`,
      );
    }
    return {
      marche: entry.marche,
      description: entry.description,
      detail,
      lien: `#concept-${entry.marche.toLowerCase()}`,
    };
  });

  writeFileSync(conceptsPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  process.stdout.write(
    `[gen-concept-details] ${updated.length} marche(s) — src/referentiel/concepts.json régénéré (detail + lien) depuis docs/referentiel.md.\n`,
  );
}

main();
