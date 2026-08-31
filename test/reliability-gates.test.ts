/**
 * `test/reliability-gates.test.ts` — portes DÉDIÉES, par opposition à une
 * couverture incidente héritée d'ailleurs :
 *   - `fixtures/hostile` de bout en bout via `node dist/cli.js` — exit 0,
 *     `report.html` valide, avertissements listés ;
 *   - `fixtures/synthetic/no-ai-trace` via `node dist/cli.js` —
 *     `indeterminate`, White–Gold, confiance 0, exit 0 ;
 *   - `fixtures/synthetic/multi-tool` — 4 assistants inventoriés/classés,
 *     inventaire identique une fois les noms de fichiers mis en minuscules
 *     (copie construite PROGRAMMATIQUEMENT ici) ;
 *   - référentiel altéré — copie corrompue de `dist/referentiel.json` dans un
 *     répertoire temporaire, JAMAIS le fichier committé
 *     (`src/referentiel.json`) — démarrage refusé en nommant l'élément
 *     fautif, ou avertissement seul selon le cas.
 *
 * `fixtures/synthetic/no-ai-trace/` couvre déjà EXACTEMENT le besoin de ce
 * test (`ai_coauthored_ratio: 0`, `sessions_per_week: 0`, aucun
 * `repo-context/`, aucun `session.md`) — rien à étendre. Ce que ce fichier
 * ajoute : une assertion dédiée sur le CODE DE SORTIE du binaire construit
 * (`node dist/cli.js`) plutôt que sur `runAnalysis`/`buildReportHtml` appelés
 * directement.
 *
 * `test/sources/repo-context.test.ts` couvre déjà « 4 assistants
 * inventoriés/classés » ET « inventaire identique en minuscules » via une
 * fixture construite en mémoire dans un répertoire temporaire
 * (`buildMultiToolFixture`) — mais ce n'est pas un dossier `fixtures/`
 * committé. Un dossier standalone `fixtures/synthetic/multi-tool/` est donc
 * créé ici (4 fichiers réels : `AGENTS.md`, `CLAUDE.md`, `.cursorrules`,
 * `.windsurfrules`), avec un test dédié qui ne se contente pas de ce qui
 * passe incidemment via un autre fichier.
 *
 * Corruption sur une COPIE de `dist/`, jamais sur `src/referentiel.json` :
 * `runAnalysis()` (`src/analyze.ts`) appelle `loadReferentiel()` SANS
 * argument (chemin résolu par défaut via `core/paths.ts`.
 * `resolveReferentielPath()`) — il n'existe donc aucun moyen de lui faire
 * charger un référentiel corrompu autrement qu'en substituant le FICHIER
 * réellement résolu. La preuve la plus fidèle à « end-to-end via analyze » :
 * copier `dist/` (artefact de build, `.gitignore`, jamais commité) vers un
 * répertoire temporaire, y corrompre UNIQUEMENT `referentiel.json` (lu par
 * `core/paths.ts`.`resolveReferentielUrl()` relativement à
 * `dist/core/paths.js`, donc résolu vers CETTE copie une fois `node
 * <copie>/cli.js` invoqué), puis lancer le binaire réel sur cette copie. Le
 * fichier source committé (`src/referentiel.json`) n'est jamais lu ni écrit
 * par ce test — seule une copie de sortie de build, elle-même toujours
 * régénérable par `npm run build`, est modifiée puis supprimée en fin de
 * test. `test/referentiel.test.ts` couvre déjà les mêmes 2 défauts au niveau
 * `loadReferentiel(cheminExplicite)` seul — ce fichier les prouve à un niveau
 * supérieur, le binaire complet, ce que `test/referentiel.test.ts` ne fait
 * pas.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, test } from "vitest";

import { runAnalysis } from "../src/analyze.js";
import { EXIT_INTERNAL_ERROR, EXIT_SUCCESS } from "../src/core/errors.js";
import { loadRepoContext } from "../src/sources/repo-context.js";

const TEST_FILE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "..");
const DIST_DIR = join(REPO_ROOT, "dist");
const DIST_CLI = join(DIST_DIR, "cli.js");

function ensureDistBuilt(): void {
  if (!existsSync(DIST_CLI)) {
    throw new Error(
      `dist/cli.js introuvable (${DIST_CLI}) — lancez \`npm run build\` avant ce test ` +
        "(même convention que evals/run.ts : ce fichier valide le binaire RÉELLEMENT construit, jamais les sources TS).",
    );
  }
}

interface CliRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(cliPath: string, args: readonly string[]): CliRun {
  const result = spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function makeScratchDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

// ---------------------------------------------------------------------------
// fixtures/hostile — porte dédiée.
// ---------------------------------------------------------------------------

describe("fixtures/hostile via node dist/cli.js — porte dédiée Part 6 (tâche 3)", () => {
  beforeAll(() => {
    ensureDistBuilt();
  });

  test("exit 0, result.json avec avertissements listés, report.html valide", () => {
    const outDir = makeScratchDir("recognaize-reliability-hostile-out-");
    try {
      const run = runCli(DIST_CLI, ["analyze", join(REPO_ROOT, "fixtures", "hostile"), "--out", outDir]);
      expect(run.status, `stderr: ${run.stderr}`).toBe(EXIT_SUCCESS);

      const subjectDirs = readdirSync(outDir);
      expect(subjectDirs).toHaveLength(1);
      const subjectDir = join(outDir, subjectDirs[0] ?? "");

      const document = JSON.parse(readFileSync(join(subjectDir, "result.json"), "utf8")) as {
        status: string;
        warnings: readonly string[];
      };
      expect(["ok", "indeterminate"]).toContain(document.status);
      expect(Array.isArray(document.warnings)).toBe(true);
      expect(document.warnings.length).toBeGreaterThan(0);

      const html = readFileSync(join(subjectDir, "report.html"), "utf8");
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain("<html lang=\"fr\">");
      expect(html).toContain("</html>");
      expect(html.length).toBeGreaterThan(0);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// fixtures/synthetic/no-ai-trace — porte dédiée.
// ---------------------------------------------------------------------------

describe("fixtures/synthetic/no-ai-trace via node dist/cli.js — porte dédiée Part 6 (tâche 4)", () => {
  beforeAll(() => {
    ensureDistBuilt();
  });

  test("indeterminate, rang_affiche null, confiance 0, fourchette White-Gold, exit 0", () => {
    const outDir = makeScratchDir("recognaize-reliability-no-ai-trace-out-");
    try {
      const run = runCli(DIST_CLI, ["analyze", join(REPO_ROOT, "fixtures", "synthetic", "no-ai-trace"), "--out", outDir]);
      expect(run.status, `stderr: ${run.stderr}`).toBe(EXIT_SUCCESS);

      const subjectDirs = readdirSync(outDir);
      expect(subjectDirs).toHaveLength(1);
      const subjectDir = join(outDir, subjectDirs[0] ?? "");

      const document = JSON.parse(readFileSync(join(subjectDir, "result.json"), "utf8")) as {
        status: string;
        rang_affiche: string | null;
        confiance_globale: number;
        fourchette: { bas: string; haut: string };
      };
      expect(document.status).toBe("indeterminate");
      expect(document.rang_affiche).toBeNull();
      expect(document.confiance_globale).toBe(0);
      expect(document.fourchette).toEqual({ bas: "white", haut: "gold" });

      const html = readFileSync(join(subjectDir, "report.html"), "utf8");
      expect(html).toMatch(/<h1>Indéterminé<\/h1>/);
      expect(html).toMatch(/Fourchette : white – gold/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// fixtures/synthetic/multi-tool — porte dédiée.
// ---------------------------------------------------------------------------

/** Recopie récursivement `srcDir` vers `destDir`, en lowercasant chaque segment de nom rencontré (même logique que test/sources/repo-context.test.ts). */
function copyLowercasedRecursive(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const srcAbs = join(srcDir, entry);
    const destAbs = join(destDir, entry.toLowerCase());
    if (statSync(srcAbs).isDirectory()) {
      copyLowercasedRecursive(srcAbs, destAbs);
    } else {
      writeFileSync(destAbs, readFileSync(srcAbs));
    }
  }
}

describe("fixtures/synthetic/multi-tool — porte dédiée Part 6 (tâche 5)", () => {
  const MULTI_TOOL_DIR = join(REPO_ROOT, "fixtures", "synthetic", "multi-tool");

  test("4 assistants inventoriés et classés (AGENTS.md, CLAUDE.md identité ; .cursorrules, .windsurfrules règle)", () => {
    const result = loadRepoContext(MULTI_TOOL_DIR);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.artifacts).toHaveLength(4);
    const byBasename = new Map(result.data.artifacts.map((a) => [a.relPath.split("/").pop(), a.category]));
    expect(byBasename.get("AGENTS.md")).toBe("identite");
    expect(byBasename.get("CLAUDE.md")).toBe("identite");
    expect(byBasename.get(".cursorrules")).toBe("regle");
    expect(byBasename.get(".windsurfrules")).toBe("regle");
  });

  test("le même dossier avec tous les noms de fichiers en minuscules donne un inventaire identique (copie construite ici, jamais dupliquée à la main)", () => {
    const original = loadRepoContext(MULTI_TOOL_DIR);
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const loweredRoot = makeScratchDir("recognaize-multi-tool-lowered-");
    try {
      copyLowercasedRecursive(join(MULTI_TOOL_DIR, "repo-context"), join(loweredRoot, "repo-context"));
      writeFileSync(join(loweredRoot, "profile.json"), readFileSync(join(MULTI_TOOL_DIR, "profile.json")));

      const lowered = loadRepoContext(loweredRoot);
      expect(lowered.ok).toBe(true);
      if (!lowered.ok) return;

      const toComparable = (artifacts: typeof original.data.artifacts) =>
        [...artifacts].map((a) => `${a.category}:${a.relPath.toLowerCase()}:${a.specific}`).sort();

      expect(toComparable(lowered.data.artifacts)).toEqual(toComparable(original.data.artifacts));
      expect(lowered.data.artifacts).toHaveLength(original.data.artifacts.length);
    } finally {
      rmSync(loweredRoot, { recursive: true, force: true });
    }
  });

  test("le pipeline complet (runAnalysis) ne lève jamais sur cette fixture", () => {
    expect(() => runAnalysis(MULTI_TOOL_DIR, "multi-tool-smoke", { includeExperimentalLlm: false })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Référentiel altéré — porte dédiée.
// ---------------------------------------------------------------------------

interface RawProofPath {
  path_id: string;
  description: string;
  force: string;
  signal_id: string;
  source: string;
}
interface RawMarche {
  id: string;
  label: string;
  default: boolean;
  proof_paths: RawProofPath[];
  counter_proof: unknown;
}
interface RawAxis {
  id: string;
  label: string;
  reference_source: string[];
  marches: RawMarche[];
}
interface RawReferentiel {
  axes: RawAxis[];
  thresholds: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Copie `dist/` (build déjà réalisé, jamais `src/referentiel.json` lui-même)
 * vers un répertoire temporaire, y applique `mutate` sur son
 * `referentiel.json`, et renvoie le chemin du `cli.js` de CETTE copie —
 * jamais celui du `dist/` réel. `cleanup()` supprime la copie entière.
 *
 * Le répertoire temporaire vit sous `os.tmpdir()`, hors de toute ancêtre
 * contenant un `node_modules` — sans plus, `node <copie>/cli.js` échoue à
 * résoudre les dépendances bare-specifier (`commander`, `zod`) avant même
 * d'atteindre `loadReferentiel()`. Un lien symbolique vers le `node_modules`
 * RÉEL du dépôt (jamais copié — juste référencé) et un `package.json`
 * minimal (`{"type":"module"}`, explicite plutôt que de dépendre d'une
 * détection ambiante) résolvent les deux sans dupliquer `node_modules/`.
 */
function makeCorruptedDist(mutate: (referentiel: RawReferentiel) => void): { readonly cliPath: string; readonly cleanup: () => void } {
  const tmpDist = makeScratchDir("recognaize-referentiel-corrupt-dist-");
  cpSync(DIST_DIR, tmpDist, { recursive: true });
  symlinkSync(join(REPO_ROOT, "node_modules"), join(tmpDist, "node_modules"), "dir");
  writeFileSync(join(tmpDist, "package.json"), JSON.stringify({ type: "module" }));
  const referentielPath = join(tmpDist, "referentiel.json");
  const referentiel = JSON.parse(readFileSync(referentielPath, "utf8")) as RawReferentiel;
  mutate(referentiel);
  writeFileSync(referentielPath, JSON.stringify(referentiel));
  return {
    cliPath: join(tmpDist, "cli.js"),
    cleanup: () => rmSync(tmpDist, { recursive: true, force: true }),
  };
}

describe("référentiel altéré — porte dédiée Part 6 (tâche 6), copie corrompue de dist/, jamais src/referentiel.json", () => {
  beforeAll(() => {
    ensureDistBuilt();
  });

  test("marche référencée par un check mais absente du référentiel -> démarrage refusé, nommant T2.p1", () => {
    // Retirer la marche T2 ENTIÈRE trébuche d'abord sur la
    // validation de la ligne de montée (`ladder` cite encore "T2") —
    // ANTÉRIEURE, dans loadReferentiel(), à la validation "check déclare un
    // path_id absent" du registre (buildRegistry, postérieure). Pour isoler
    // spécifiquement CETTE seconde validation (« une marche référencée par un
    // check mais absente du référentiel »),
    // on retire uniquement le proof_path "T2.p1" (T2 garde T2.p2/T2.p3, reste
    // une marche valide pour le schéma ET pour le ladder) : le check
    // "T2.git-activity" (`src/checks/core-git-activity/T2.git-activity.ts`)
    // continue de déclarer `path_ids: ["T2.p1"]`, désormais absent de
    // `knownPathIds` — buildRegistry() le refuse en le nommant.
    const { cliPath, cleanup } = makeCorruptedDist((referentiel) => {
      const axisT = referentiel.axes.find((a) => a.id === "T");
      const t2 = axisT?.marches.find((m) => m.id === "T2");
      if (!t2) throw new Error("marche T2 introuvable dans dist/referentiel.json — fixture de test cassée.");
      const before = t2.proof_paths.length;
      t2.proof_paths = t2.proof_paths.filter((p) => p.path_id !== "T2.p1");
      if (t2.proof_paths.length === before) {
        throw new Error('proof_path "T2.p1" introuvable sous la marche T2 — fixture de test cassée.');
      }
    });
    try {
      const outDir = makeScratchDir("recognaize-reliability-referentiel-orphan-out-");
      try {
        const run = runCli(cliPath, ["analyze", join(REPO_ROOT, "fixtures", "profiles", "perceval"), "--out", outDir]);
        expect(run.status).toBe(EXIT_INTERNAL_ERROR);
        expect(run.stderr).toContain("T2.p1");
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    } finally {
      cleanup();
    }
  });

  test("marche présente mais sans seuil pour un de ses path_id -> démarrage refusé, nommant T2.p1", () => {
    const { cliPath, cleanup } = makeCorruptedDist((referentiel) => {
      if (!("T2.p1" in referentiel.thresholds)) {
        throw new Error('"T2.p1" introuvable dans thresholds — fixture de test cassée.');
      }
      delete referentiel.thresholds["T2.p1"];
    });
    try {
      const outDir = makeScratchDir("recognaize-reliability-referentiel-missing-threshold-out-");
      try {
        const run = runCli(cliPath, ["analyze", join(REPO_ROOT, "fixtures", "profiles", "perceval"), "--out", outDir]);
        expect(run.status).toBe(EXIT_INTERNAL_ERROR);
        expect(run.stderr).toContain("T2.p1");
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    } finally {
      cleanup();
    }
  });

  test("marche sans aucun check couvrant -> avertissement seul, jamais un refus de démarrage (exit 0)", () => {
    const { cliPath, cleanup } = makeCorruptedDist((referentiel) => {
      const axisT = referentiel.axes.find((a) => a.id === "T");
      if (!axisT) throw new Error("axe T introuvable dans dist/referentiel.json — fixture de test cassée.");
      axisT.marches.push({
        id: "T5",
        label: "Marche fuzz Part 6 — volontairement sans check (test dédié tâche 6)",
        default: false,
        proof_paths: [
          {
            path_id: "T5.p1",
            description: "Marche synthétique Part 6 sans check couvrant — test dédié tâche 6.",
            force: "indice",
            signal_id: "GA.size_median",
            source: "GA",
          },
        ],
        counter_proof: null,
      });
      referentiel.thresholds["T5.p1"] = {
        kind: "condition",
        signal_id: "GA.size_median",
        comparator: "gte",
        value: 1,
        value_type: "number",
      };
    });
    try {
      const outDir = makeScratchDir("recognaize-reliability-referentiel-orphan-check-out-");
      try {
        const run = runCli(cliPath, ["analyze", join(REPO_ROOT, "fixtures", "profiles", "perceval"), "--out", outDir]);
        expect(run.status, `stderr: ${run.stderr}`).toBe(EXIT_SUCCESS);

        const subjectDirs = readdirSync(outDir);
        expect(subjectDirs).toHaveLength(1);
        const document = JSON.parse(readFileSync(join(outDir, subjectDirs[0] ?? "", "result.json"), "utf8")) as {
          warnings: readonly string[];
        };
        expect(document.warnings.some((w) => w.includes("T5.p1") && w.includes("sans aucun check couvrant"))).toBe(true);
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    } finally {
      cleanup();
    }
  });
});
