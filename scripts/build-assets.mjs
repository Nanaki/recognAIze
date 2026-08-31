#!/usr/bin/env node
// Copie les artefacts non-TypeScript de src/ vers dist/ après tsc : le référentiel
// et un éventuel dossier src/referentiel/. Portable Linux/macOS (petit
// script Node plutôt qu'un one-liner shell).
//
// Ce script ne doit jamais faire échouer le build si l'un de ces artefacts
// est absent — il copie seulement ce qui existe.

import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const srcDir = join(repoRoot, "src");
const distDir = join(repoRoot, "dist");

function copyIfExists(name, isDir) {
  const from = join(srcDir, name);
  if (!existsSync(from)) {
    console.log(`[build:assets] ${name} absent (attendu à partir de Part 2) — ignoré.`);
    return;
  }
  mkdirSync(distDir, { recursive: true });
  const to = join(distDir, name);
  if (isDir) {
    cpSync(from, to, { recursive: true });
  } else {
    copyFileSync(from, to);
  }
  console.log(`[build:assets] ${name} copié vers dist/.`);
}

copyIfExists("referentiel.json", false);
copyIfExists("referentiel", true);
