#!/usr/bin/env node
"use strict";

// Bootstrap CommonJS volontaire (voir .claude/rules/fiabilite.md et le risque
// « Bootstrap ESM qui casse avant le message Node < 20 » du plan) : ce fichier ne
// contient aucune syntaxe ESM statique, donc son analyse ne peut pas échouer sur un
// vieux Node avant que le message français n'ait eu la chance de s'imprimer.
// L'import dynamique de dist/cli.js (ESM) n'a lieu qu'APRÈS la vérification de
// version, jamais avant.

const REQUIRED_MAJOR = 20;

function main() {
  const fullVersion = process.versions.node;
  const parts = fullVersion.split(".");
  const major = Number.parseInt(parts[0], 10);
  const minor = parts[1] || "0";

  if (!Number.isFinite(major) || major < REQUIRED_MAJOR) {
    process.stderr.write("Node ≥ 20 requis (version détectée : " + major + "." + minor + ")\n");
    process.exit(3);
    return;
  }

  import("../dist/cli.js").catch((error) => {
    const detail = error && error.message ? error.message : String(error);
    process.stderr.write("Erreur interne au démarrage : " + detail + "\n");
    process.exit(1);
  });
}

main();
