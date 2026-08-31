#!/usr/bin/env -S npx tsx
/**
 * Génère `src/checks/index.ts` par balayage statique de `src/checks/<pack>/*.ts`.
 * Aucune découverte au runtime (aidd_docs/memory/architecture.md : « checks/index.ts
 * généré (pas de découverte par glob à l'exécution) ») — ce script tourne en
 * `prebuild` (`npm run build`) et produit un fichier committable, relisible, et
 * strictement déterministe : les packs (sous-dossiers) puis les fichiers dans
 * chaque pack sont triés par points de code (jamais `Intl`/`localeCompare`, jamais
 * l'ordre — non garanti — rendu par `readdirSync`), donc identique sur deux
 * machines pour un même contenu de `src/checks/`.
 *
 * Convention : chaque fichier de check exporte par défaut un objet `Check`
 * (`src/core/types.ts`). Ce script ne les importe ni ne les exécute — il se
 * contente d'émettre des imports statiques triés référençant chaque fichier
 * par son chemin ; l'exécution réelle n'a lieu qu'au chargement de
 * `checks/index.ts` par l'appelant (`src/cli.ts`, jamais `core/`).
 *
 * Un dépôt sans aucun fichier de check produit un `DISCOVERED_CHECKS` vide,
 * valide et compilable.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface DiscoveredFile {
  readonly pack: string;
  readonly fileName: string;
  readonly relPath: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const checksDir = join(repoRoot, "src", "checks");
const outputFile = join(checksDir, "index.ts");

function compareParPointsDeCode(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function isCheckSourceFile(fileName: string): boolean {
  return fileName.endsWith(".ts") && !fileName.endsWith(".d.ts");
}

/** Parcourt chaque sous-dossier direct de `src/checks/` (= un pack) et liste ses fichiers `*.ts`, triés. */
function discoverCheckFiles(): DiscoveredFile[] {
  if (!existsSync(checksDir)) {
    return [];
  }

  const packDirs = readdirSync(checksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareParPointsDeCode);

  const files: DiscoveredFile[] = [];
  for (const pack of packDirs) {
    const packPath = join(checksDir, pack);
    const fileNames = readdirSync(packPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isCheckSourceFile(entry.name))
      .map((entry) => entry.name)
      .sort(compareParPointsDeCode);
    for (const fileName of fileNames) {
      files.push({ pack, fileName, relPath: `${pack}/${fileName}` });
    }
  }

  // Second tri global (déjà garanti par construction pack-puis-fichier, mais
  // rendu explicite : le contrat est « trié par chemin de fichier », pas
  // « trié par pack puis par fichier » — les deux coïncident ici mais autant
  // ne pas en dépendre implicitement.
  files.sort((a, b) => compareParPointsDeCode(a.relPath, b.relPath));
  return files;
}

function toImportSpecifier(file: DiscoveredFile): string {
  const withoutExt = file.fileName.slice(0, -3); // retire ".ts"
  return `./${file.pack}/${withoutExt}.js`;
}

function toVarName(index: number): string {
  return `check${index}`;
}

function generateSource(files: readonly DiscoveredFile[]): string {
  const lines: string[] = [];
  lines.push("/**");
  lines.push(" * GÉNÉRÉ — ne pas éditer à la main.");
  lines.push(" *");
  lines.push(" * Produit par `scripts/gen-checks-index.ts` (`npm run prebuild` / `npm run checks:index`).");
  lines.push(" * Imports statiques triés par chemin de fichier, par points de code (jamais");
  lines.push(" * `Intl`/`localeCompare`) — aucune découverte par glob à l'exécution, voir");
  lines.push(" * `aidd_docs/memory/architecture.md`.");
  lines.push(" */");
  lines.push("");
  lines.push('import type { Check } from "../core/types.js";');
  if (files.length > 0) {
    lines.push("");
    files.forEach((file, index) => {
      lines.push(`import ${toVarName(index)} from "${toImportSpecifier(file)}";`);
    });
  }
  lines.push("");
  lines.push("/** Un fichier physiquement présent sous `src/checks/**`, avec le `Check` qu'il exporte par défaut. */");
  lines.push("export interface DiscoveredCheckEntry {");
  lines.push("  readonly file: string;");
  lines.push("  readonly check: Check;");
  lines.push("}");
  lines.push("");
  if (files.length === 0) {
    lines.push("export const DISCOVERED_CHECKS: readonly DiscoveredCheckEntry[] = [];");
  } else {
    lines.push("export const DISCOVERED_CHECKS: readonly DiscoveredCheckEntry[] = [");
    files.forEach((file, index) => {
      lines.push(`  { file: ${JSON.stringify(file.relPath)}, check: ${toVarName(index)} },`);
    });
    lines.push("];");
  }
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  mkdirSync(checksDir, { recursive: true });
  const files = discoverCheckFiles();
  writeFileSync(outputFile, generateSource(files), "utf8");
  process.stdout.write(
    `[gen-checks-index] ${files.length} fichier(s) de check découvert(s) — src/checks/index.ts écrit.\n`,
  );
}

main();
