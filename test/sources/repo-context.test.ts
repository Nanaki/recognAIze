// Contract tests pour `src/sources/repo-context.ts`. Couvre :
// - inventaire de 4 assistants différents, classement, insensibilité à la
//   casse (même dossier en minuscules ⇒ même inventaire) ;
// - détecteur de spécificité (CLAUDE.md générique de 3 lignes vs AGENTS.md
//   citant stack/chemins/règles impératives) ;
// - `node_modules/` sauté entièrement, image sautée, arborescence bornée
//   (plafond de 200 fichiers texte réutilisé) ;
// - dossier `repo-context/` absent ⇒ `{ok:false, warning}` ;
// - les 3 fixtures réelles qui ont un `repo-context/` (bohort, leodagan,
//   arthur — perceval n'en a pas) sont inventoriées sans exception.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { runAnalysis } from "../../src/analyze.js";
import { loadRepoContext } from "../../src/sources/repo-context.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "profiles");
const FIXTURES_HOSTILE_DIR = join(REPO_ROOT, "fixtures", "hostile");
const PERCEVAL_DIR = join(FIXTURES_DIR, "perceval");

const scratchDirs: string[] = [];

function makeScratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "recognaize-repo-context-"));
  scratchDirs.push(dir);
  return dir;
}

function writeFile(dir: string, relPath: string, content: string | Buffer): void {
  const abs = join(dir, relPath);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

/** Recopie récursivement `srcDir` vers `destDir`, en LOWERCASANT chaque segment de nom rencontré. */
function copyLowercased(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const srcAbs = join(srcDir, entry);
    const destAbs = join(destDir, entry.toLowerCase());
    if (statSync(srcAbs).isDirectory()) {
      copyLowercased(srcAbs, destAbs);
    } else {
      writeFileSync(destAbs, readFileSync(srcAbs));
    }
  }
}

afterEach(() => {
  while (scratchDirs.length > 0) {
    const dir = scratchDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("loadRepoContext — repo-context/ absent", () => {
  test("un dossier de profil sans repo-context/ rend {ok:false, warning}", () => {
    const dir = makeScratchDir();
    writeFile(dir, "profile.json", "{}");

    const result = loadRepoContext(dir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning.file).toBe("repo-context");
    }
  });
});

describe("loadRepoContext — les 3 fixtures réelles avec repo-context/", () => {
  const PROFILES_WITH_REPO_CONTEXT = ["bohort", "leodagan", "arthur"] as const;

  for (const profile of PROFILES_WITH_REPO_CONTEXT) {
    test(`${profile}/repo-context/ est inventorié sans avertissement inattendu`, () => {
      const result = loadRepoContext(join(FIXTURES_DIR, profile));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.artifacts.length).toBeGreaterThan(0);
        const identityArtifacts = result.data.artifacts.filter((a) => a.category === "identite");
        expect(identityArtifacts.length).toBeGreaterThan(0);
      }
    });
  }

  test("perceval n'a pas de repo-context/ : {ok:false}", () => {
    const result = loadRepoContext(join(FIXTURES_DIR, "perceval"));
    expect(result.ok).toBe(false);
  });
});

describe("loadRepoContext — 4 assistants différents, classement et insensibilité à la casse", () => {
  function buildMultiToolFixture(dir: string): void {
    // Identité (3 assistants différents + Copilot).
    writeFile(dir, "repo-context/AGENTS.md", "# AGENTS.md\n\nProject in TypeScript, uses `src/api/` for routes.\n\nAlways run tests. Never skip the lint step.\n");
    writeFile(dir, "repo-context/CLAUDE.md", "# CLAUDE.md\n\n@AGENTS.md\n");
    writeFile(dir, "repo-context/GEMINI.md", "# GEMINI.md\n\nSee AGENTS.md for conventions.\n");
    writeFile(dir, "repo-context/.github/copilot-instructions.md", "Follow AGENTS.md conventions for this repo.\n");

    // Règles (Cursor, Windsurf, Cline, Claude, Copilot).
    writeFile(dir, "repo-context/.cursorrules", "Never commit secrets.\n");
    writeFile(dir, "repo-context/.windsurfrules", "Always write tests first.\n");
    writeFile(dir, "repo-context/.clinerules", "Never touch the payments module.\n");
    writeFile(dir, "repo-context/.cursor/rules/style.md", "Use 2-space indentation.\n");
    writeFile(dir, "repo-context/.claude/rules/fiabilite.md", "Ne jamais lever d'exception hors frontière.\n");
    writeFile(dir, "repo-context/.github/instructions/style.md", "Follow the existing code style.\n");

    // Skill / agent / hook / prompt.
    writeFile(dir, "repo-context/.claude/skills/onboard/SKILL.md", "Onboarding skill.\n");
    writeFile(dir, "repo-context/.claude/agents/reviewer.md", "Reviews pull requests.\n");
    writeFile(dir, "repo-context/.claude/hooks/pre-commit.md", "Runs lint before commit.\n");
    writeFile(dir, "repo-context/.github/prompts/refactor.md", "Refactor prompt template.\n");
    writeFile(dir, "repo-context/.github/agents/bot.md", "Automated review bot.\n");
    writeFile(dir, "repo-context/.github/hooks/ci.md", "CI hook description.\n");

    // Deny-list.
    writeFile(dir, "repo-context/.claude/settings.json", JSON.stringify({ permissions: { deny: ["Bash(rm -rf *)"] } }, null, 2));

    // Mémoire / capitalisation.
    writeFile(dir, "repo-context/aidd_docs/memory/architecture.md", "Architecture overview.\n");
    writeFile(dir, "repo-context/aidd_docs/tasks/2026-01-x.md", "Task record.\n");
    writeFile(dir, "repo-context/docs/context/glossary.md", "Glossary of terms.\n");
    writeFile(dir, "repo-context/docs/decisions/0001-db.md", "Decision record.\n");

    // node_modules à la racine de repo-context/ : ne doit JAMAIS être visité.
    writeFile(dir, "repo-context/node_modules/some-pkg/index.js", "module.exports = {};\n");
    writeFile(dir, "repo-context/node_modules/some-pkg/package.json", "{}\n");

    // Image (octet nul) DANS un dossier connu et parcouru : doit être sautée par le plafond binaire.
    writeFile(dir, "repo-context/.claude/rules/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x0d]));
  }

  test("les artefacts des 4 assistants sont inventoriés et classés", () => {
    const dir = makeScratchDir();
    buildMultiToolFixture(dir);

    const result = loadRepoContext(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const byCategory = new Map<string, number>();
    for (const artifact of result.data.artifacts) {
      byCategory.set(artifact.category, (byCategory.get(artifact.category) ?? 0) + 1);
    }

    expect(byCategory.get("identite")).toBe(4); // AGENTS.md, CLAUDE.md, GEMINI.md, copilot-instructions.md
    expect(byCategory.get("regle")).toBe(6); // .cursorrules, .windsurfrules, .clinerules, .cursor/rules/style.md, .claude/rules/fiabilite.md, .github/instructions/style.md
    expect(byCategory.get("skill")).toBe(1);
    expect(byCategory.get("agent")).toBe(2);
    expect(byCategory.get("hook")).toBe(2);
    expect(byCategory.get("prompt")).toBe(1);
    expect(byCategory.get("deny-list")).toBe(1);
    expect(byCategory.get("memoire")).toBe(2);
    expect(byCategory.get("capitalisation")).toBe(2);
  });

  test("node_modules/ est sauté entièrement, l'image est sautée", () => {
    const dir = makeScratchDir();
    buildMultiToolFixture(dir);

    const result = loadRepoContext(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const paths = result.data.artifacts.map((a) => a.relPath);
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(paths.some((p) => p.endsWith("logo.png"))).toBe(false);
  });

  test("le même dossier avec tous les noms en minuscules donne le même inventaire", () => {
    const original = makeScratchDir();
    buildMultiToolFixture(original);
    writeFile(original, "profile.json", "{}");

    const lowered = makeScratchDir();
    copyLowercased(join(original, "repo-context"), join(lowered, "repo-context"));

    const originalResult = loadRepoContext(original);
    const loweredResult = loadRepoContext(lowered);

    expect(originalResult.ok).toBe(true);
    expect(loweredResult.ok).toBe(true);
    if (!originalResult.ok || !loweredResult.ok) return;

    const toComparable = (artifacts: typeof originalResult.data.artifacts) =>
      artifacts
        .map((a) => `${a.category}:${a.relPath.toLowerCase()}:${a.specific}`)
        .sort();

    expect(toComparable(loweredResult.data.artifacts)).toEqual(toComparable(originalResult.data.artifacts));
    expect(loweredResult.data.artifacts.length).toBe(originalResult.data.artifacts.length);
  });
});

describe("loadRepoContext — détecteur de spécificité", () => {
  test("un CLAUDE.md générique de 3 lignes n'est PAS spécifique", () => {
    const dir = makeScratchDir();
    writeFile(
      dir,
      "repo-context/CLAUDE.md",
      "You are a helpful assistant.\nAnswer clearly and be concise.\nBe polite.\n",
    );

    const result = loadRepoContext(dir, { stack: ["TypeScript", "Next.js"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const claude = result.data.artifacts.find((a) => a.relPath.endsWith("CLAUDE.md"));
    expect(claude).toBeDefined();
    expect(claude?.specific).toBe(false);
  });

  test("un AGENTS.md citant la stack, des chemins plausibles et des règles impératives EST spécifique", () => {
    const dir = makeScratchDir();
    writeFile(
      dir,
      "repo-context/AGENTS.md",
      [
        "# AGENTS.md",
        "",
        "This project uses TypeScript and Next.js.",
        "",
        "Routes live under `src/api/routes/`. Shared utilities are in `src/lib/`.",
        "",
        "## Rules",
        "",
        "- Never commit secrets to `config/secrets.json`.",
        "- Always write a test before implementing.",
        "- Domain errors must go through `DomainError`.",
        "- Ne jamais toucher au module de paiement sans revue humaine.",
        "- Keep functions small and named clearly.",
        "- Document any non-obvious decision inline.",
        "",
      ].join("\n"),
    );

    const result = loadRepoContext(dir, { stack: ["TypeScript", "Next.js", "Prisma"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const agents = result.data.artifacts.find((a) => a.relPath.endsWith("AGENTS.md"));
    expect(agents).toBeDefined();
    expect(agents?.specific).toBe(true);
    expect(agents?.specificityHints).toContain("path_plausible");
    expect(agents?.specificityHints).toContain("stack_named");
    expect(agents?.specificityHints).toContain("imperative_rule");
  });
});

describe("loadRepoContext — détecteur d'usage", () => {
  test("un artefact cité par le fichier d'identité est marqué 'used' avec l'indice referenced_by_identity", () => {
    const dir = makeScratchDir();
    writeFile(dir, "repo-context/AGENTS.md", "See rules in `.claude/rules/fiabilite.md` for details.\n");
    writeFile(dir, "repo-context/.claude/rules/fiabilite.md", "Ne jamais lever d'exception hors frontière.\n");

    const result = loadRepoContext(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rule = result.data.artifacts.find((a) => a.relPath.endsWith("fiabilite.md"));
    expect(rule?.used).toBe(true);
    expect(rule?.usageHints).toContain("referenced_by_identity");
  });

  test("un artefact cité dans la session est marqué 'used' avec l'indice cited_in_session", () => {
    const dir = makeScratchDir();
    writeFile(dir, "repo-context/.claude/rules/fiabilite.md", "Ne jamais lever d'exception.\n");

    const result = loadRepoContext(dir, { sessionText: "On applique la règle décrite dans fiabilite.md avant de merger." });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rule = result.data.artifacts.find((a) => a.relPath.endsWith("fiabilite.md"));
    expect(rule?.used).toBe(true);
    expect(rule?.usageHints).toContain("cited_in_session");
  });

  test("modified_in_window : context_files.last_updated dans la fenêtre marque TOUS les artefacts used", () => {
    const dir = makeScratchDir();
    writeFile(dir, "repo-context/AGENTS.md", "Generic instructions.\n");

    const result = loadRepoContext(dir, {
      window: { from: "2026-01-01", to: "2026-07-31" },
      contextFilesLastUpdated: "2026-07-12",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const agents = result.data.artifacts.find((a) => a.relPath.endsWith("AGENTS.md"));
    expect(agents?.usageHints).toContain("modified_in_window");
  });

  test("un artefact ni référencé, ni modifié dans la fenêtre, ni cité n'est pas 'used'", () => {
    const dir = makeScratchDir();
    writeFile(dir, "repo-context/.claude/rules/orphan.md", "Une règle jamais citée nulle part.\n");

    const result = loadRepoContext(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rule = result.data.artifacts.find((a) => a.relPath.endsWith("orphan.md"));
    expect(rule?.used).toBe(false);
    expect(rule?.usageHints).toEqual([]);
  });
});

describe("loadRepoContext — arborescence bornée", () => {
  test("plus de 200 fichiers texte dans un même sous-dossier connu déclenche le plafond de la Phase 1", () => {
    const dir = makeScratchDir();
    for (let i = 0; i < 210; i += 1) {
      writeFile(dir, `repo-context/aidd_docs/memory/file-${String(i).padStart(3, "0")}.md`, `contenu ${i}\n`);
    }

    const result = loadRepoContext(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const memoryArtifacts = result.data.artifacts.filter((a) => a.category === "memoire");
    expect(memoryArtifacts.length).toBeLessThanOrEqual(200);
    expect(result.warnings.some((w) => w.code === "text_file_cap_reached")).toBe(true);
  });
});

/**
 * Complète le jeu des 8 cas hostiles pour `repo-context.ts`.
 *
 * `repo-context/` est un DOSSIER inventorié par emplacements connus, pas un
 * fichier JSON unique parsé une fois : « invalid JSON », « array vs objet »,
 * « `null` », « champ inconnu », « champ mal typé » n'ont donc pas de sens ici
 * (aucun `JSON.parse` de tout ce module, sauf pour `.claude/settings.json`
 * dont le CONTENU n'est jamais interprété — seule sa présence/classement
 * compte) — délibérément SKIPPÉS, pas oubliés. BOM/UTF-16, fichier de 3 Mo et
 * symlink sortant restent pleinement applicables à chaque fichier individuel
 * de l'arborescence et manquaient : ajoutés ci-dessous.
 */
describe("loadRepoContext — Phase 4 : cas de contrat additionnels", () => {
  test("un fichier de plus de 2 Mo dans un sous-dossier connu est sauté avec avertissement, le reste de l'inventaire reste exploité", () => {
    const dir = makeScratchDir();
    writeFile(dir, "repo-context/AGENTS.md", "# AGENTS.md\n\nProjet minimal.\n");
    writeFile(dir, "repo-context/.claude/rules/huge.md", Buffer.alloc(3_000_001, "x"));
    writeFile(dir, "repo-context/.claude/rules/normal.md", "Une règle normale, courte.\n");

    expect(() => loadRepoContext(dir)).not.toThrow();
    const result = loadRepoContext(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.artifacts.some((a) => a.relPath.endsWith("huge.md"))).toBe(false);
    expect(result.data.artifacts.some((a) => a.relPath.endsWith("normal.md"))).toBe(true);
    expect(result.warnings.some((w) => w.code === "file_too_large")).toBe(true);
  });

  test("AGENTS.md comme lien symbolique sortant du dossier analysé est sauté avec avertissement, jamais d'exception", () => {
    const outsideDir = makeScratchDir();
    const secret = join(outsideDir, "secret-agents.md");
    writeFileSync(secret, "# AGENTS.md\n\nContenu hors dossier analysé.\n", "utf8");

    const dir = makeScratchDir();
    mkdirSync(join(dir, "repo-context"), { recursive: true });
    symlinkSync(secret, join(dir, "repo-context", "AGENTS.md"));

    expect(() => loadRepoContext(dir)).not.toThrow();
    const result = loadRepoContext(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.artifacts.some((a) => a.relPath.endsWith("AGENTS.md"))).toBe(false);
    expect(result.warnings.some((w) => w.code === "symlink_escapes_root")).toBe(true);
  });

  test("AGENTS.md précédé d'un BOM UTF-8 est décodé et inventorié normalement", () => {
    const dir = makeScratchDir();
    const body = "# AGENTS.md\n\nProjet en TypeScript.\n";
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf8")]);
    writeFile(dir, "repo-context/AGENTS.md", withBom);

    const result = loadRepoContext(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const agents = result.data.artifacts.find((a) => a.relPath.endsWith("AGENTS.md"));
    expect(agents).toBeDefined();
    expect(result.warnings).toEqual([]);
  });

  test("un fichier UTF-16 sans BOM dans un sous-dossier connu est détecté binaire et sauté (non_text_skipped), pas une exception", () => {
    // `looksBinary` classe un texte UTF-16 (BOM ou non) comme binaire dans les
    // arborescences bornées — cohérent avec le comportement documenté de
    // `readTextTreeBounded`, jamais un crash.
    const dir = makeScratchDir();
    writeFile(dir, "repo-context/AGENTS.md", "# AGENTS.md\n\nProjet minimal.\n");
    writeFile(
      dir,
      "repo-context/.claude/rules/utf16.md",
      Buffer.from("Texte assez long pour l'heuristique de détection UTF-16 sans BOM.", "utf16le"),
    );

    expect(() => loadRepoContext(dir)).not.toThrow();
    const result = loadRepoContext(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.artifacts.some((a) => a.relPath.endsWith("utf16.md"))).toBe(false);
    expect(result.warnings.some((w) => w.code === "non_text_skipped")).toBe(true);
  });

  test("fixture réelle fixtures/hostile/repo-context/ : AGENTS.md inventorié, node_modules/ jamais visité, sans exception", () => {
    expect(() => loadRepoContext(FIXTURES_HOSTILE_DIR)).not.toThrow();
    const result = loadRepoContext(FIXTURES_HOSTILE_DIR);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.artifacts.some((a) => a.relPath.endsWith("AGENTS.md"))).toBe(true);
    expect(result.data.artifacts.some((a) => a.relPath.includes("node_modules"))).toBe(false);
  });

  // Le test « AGENTS.md comme lien symbolique sortant » ci-dessus ne couvre
  // que la FEUILLE symlinkée, avec `repo-context/` toujours un vrai
  // répertoire. Un autre cas doit rester couvert : `repo-context/` LUI-MÊME
  // est le lien symbolique, et `AGENTS.md` en dessous est un fichier
  // ORDINAIRE (pas un lien) — le cas qu'un `checkSymlinkSafety` qui ne
  // `lstat`erait que le dernier composant du chemin laisserait passer en
  // silence, contenu externe compris. Reproduit ici EXACTEMENT ce scénario
  // (`repo-context/ -> répertoire externe` contenant un `AGENTS.md`) et
  // vérifie (a) qu'aucun artefact externe n'entre dans l'inventaire (donc
  // aucune influence sur une Evidence/un rang en aval) et (b) qu'un
  // avertissement `symlink_escapes_root` explicite, portant le chemin
  // relatif concerné, est bien émis.
  test("repo-context/ LUI-MÊME symlinké vers un répertoire externe contenant un AGENTS.md : contenu externe jamais suivi, avertissement explicite (régression revue indépendante 2026-08-29)", () => {
    const outsideDir = makeScratchDir();
    writeFileSync(
      join(outsideDir, "AGENTS.md"),
      "# AGENTS.md externe\n\nCeci ne doit JAMAIS influencer un rang.\n",
      "utf8",
    );

    const dir = makeScratchDir();
    symlinkSync(outsideDir, join(dir, "repo-context"));

    expect(() => loadRepoContext(dir)).not.toThrow();
    const result = loadRepoContext(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // (a) aucun artefact externe dans l'inventaire — zéro influence possible.
    expect(result.data.artifacts).toEqual([]);
    expect(result.data.artifacts.some((a) => a.relPath.endsWith("AGENTS.md"))).toBe(false);

    // (b) avertissement explicite, avec le chemin relatif concerné.
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "symlink_escapes_root", file: join("repo-context", "AGENTS.md") }),
    );
    expect(result.warnings.some((w) => JSON.stringify(w).includes(outsideDir))).toBe(false);
  });
});

/**
 * Preuve bout-en-bout de la garde contre l'échappement par répertoire
 * symlinké. Les tests ci-dessus prouvent que `loadRepoContext` lui-même ne
 * construit aucun artefact depuis le répertoire externe. Celui-ci va plus
 * loin : passe par le pipeline COMPLET (`runAnalysis`, mêmes 46 checks +
 * `judge()` que la CLI réelle) et compare deux runs qui ne diffèrent QUE par
 * le contenu du répertoire externe symlinké, jamais par la présence de
 * `repo-context/` elle-même (un `repo-context/` réel mais VIDE sert de
 * référence, pour isoler strictement « le contenu externe a-t-il une
 * influence » de « la présence de `repo-context/` a-t-elle une influence » —
 * deux questions différentes, seule la première est celle de la garde testée
 * ici).
 */
describe("échappement par répertoire symlinké — preuve bout-en-bout sur Evidence/rang (régression revue indépendante 2026-08-29)", () => {
  test("repo-context/ symlinké vers un répertoire externe contenant un AGENTS.md très spécifique n'influence NI l'Evidence NI le rang, et produit un avertissement explicite", () => {
    // Référence : perceval + repo-context/ réel et VIDE (même presence.RC que
    // le cas compromis, sans aucun lien symbolique).
    const baselineDir = makeScratchDir();
    cpSync(PERCEVAL_DIR, baselineDir, { recursive: true });
    mkdirSync(join(baselineDir, "repo-context"));

    // Cas compromis : même profil, mais repo-context/ symlinké vers un
    // répertoire externe contenant un AGENTS.md délibérément TRÈS spécifique
    // (règle impérative, chemins nommés, plus de 10 lignes utiles) — le genre
    // de contenu qui, lu, ferait basculer un axe d'identité (H2) d'infirmé à
    // prouvé si la garde ne le bloquait pas.
    const outsideDir = makeScratchDir();
    writeFileSync(
      join(outsideDir, "AGENTS.md"),
      [
        "# AGENTS.md",
        "",
        "Identité très spécifique du harness pour ce dépôt.",
        "Référence explicite les chemins src/index.ts et docs/architecture.md.",
        "Toujours appliquer ces règles à la lettre, ne jamais s'en écarter.",
        "Ligne utile 1.",
        "Ligne utile 2.",
        "Ligne utile 3.",
        "Ligne utile 4.",
        "Ligne utile 5.",
        "Ligne utile 6.",
        "",
      ].join("\n"),
      "utf8",
    );
    const compromisedDir = makeScratchDir();
    cpSync(PERCEVAL_DIR, compromisedDir, { recursive: true });
    symlinkSync(outsideDir, join(compromisedDir, "repo-context"));

    const options = { includeExperimentalLlm: false } as const;
    const baseline = runAnalysis(baselineDir, "symlink-directory-escape-e2e", options);
    const compromised = runAnalysis(compromisedDir, "symlink-directory-escape-e2e", options);

    // (a) le contenu externe n'influence NI l'Evidence NI le rang (`judgeResult`).
    expect(compromised.evidence).toEqual(baseline.evidence);
    expect(compromised.judgeResult).toEqual(baseline.judgeResult);

    // (b) avertissement explicite, portant le chemin relatif concerné —
    // absent du run de référence (aucun symlink là-bas).
    expect(
      compromised.warnings.some(
        (w) => w.includes("symlink_escapes_root") && w.includes(join("repo-context", "AGENTS.md")),
      ),
    ).toBe(true);
    expect(baseline.warnings.some((w) => w.includes("symlink_escapes_root"))).toBe(false);
    expect(compromised.warnings.some((w) => w.includes(outsideDir))).toBe(false);
  });
});
