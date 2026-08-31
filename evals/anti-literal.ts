/**
 * Garde anti-littéral. Scanne `src/checks/**\/*.ts` et échoue en nommant le
 * fichier + la ligne dès qu'un littéral numérique AUTRE que `0` ou `1` y
 * apparaît — `.claude/rules/fiabilite.md` : « les seuils vivent dans
 * `referentiel.json`, jamais en littéraux dans les checks ».
 *
 * Règle exacte retenue :
 * - Analyse par AST réel (`typescript` — déjà une dépendance du projet), pas une
 *   regex sur le texte source : évite les faux positifs/négatifs sur un nombre
 *   dans une chaîne, un commentaire ou un template literal (aucun de ces trois
 *   n'est un `NumericLiteral`/`BigIntLiteral` de l'AST).
 * - Seuls `0` et `1` sont tolérés, QUELLE QUE SOIT leur position syntaxique
 *   (littéral seul, argument, opérande d'une comparaison, valeur de champ d'objet
 *   comme `confiance_source: 1`…) — aucune exemption additionnelle pour un index
 *   de tableau ou toute autre construction « structurelle » : un check n'a
 *   normalement besoin d'aucun autre nombre en dur (accès par nom de champ,
 *   `thresholdFor(referentiel, path_id)` pour tout seuil réel, `.length`,
 *   déstructuration…). Choisi délibérément PLUS strict que « 0/1 plus quelques
 *   exceptions structurelles » suggéré par le plan : plus simple à auditer, sans
 *   zone grise sur ce qui compte comme « structurel ».
 * - `-1` (unaire moins appliqué au littéral `1`) reste toléré : c'est la valeur
 *   du littéral `NumericLiteral` lui-même (`"1"`) qui est testée, pas le signe —
 *   `-1` est une sentinelle usuelle (« absent »/« non trouvé »), jamais un seuil
 *   métier plausible.
 * - Un `BigIntLiteral` (`0n`, `1n`, `2n`…) suit la même règle que
 *   `NumericLiteral` — aucun check de ce projet n'en a besoin, mais la garde
 *   reste correcte si un jour l'un en contenait un.
 *
 * `src/lib/` est scanné en plus de `src/checks/**` : plusieurs fonctions de
 * `src/lib/` calculent un vrai seuil consommé par un check SANS jamais le
 * lire depuis `referentiel.json` — invisible à cette garde du seul fait de
 * leur emplacement si elle se limitait aux checks. `findAntiLiteralViolations`
 * est donc appelée aussi sur `src/lib/` (voir `evals/run.ts`.`runAntiLiteralGuard`)
 * — mais `src/lib/` n'a pas la discipline « 1 check = 1 fichier, aucun littéral
 * hors 0/1 » de `src/checks/**` : il porte aussi des constantes STRUCTURELLES d'algorithme
 * (position médiane d'un histogramme, longueur d'un préfixe de date ISO) et
 * des seuils purement d'AFFICHAGE (jamais consommés par un check — badge
 * qualité). Ni l'un ni l'autre n'est le « seuil métier en dur, invisible au
 * référentiel » que cette garde cible. Un littéral de `src/lib/**` (jamais de
 * `src/checks/**`, qui reste strictement 0/1 sans AUCUNE exemption) peut donc
 * être exempté par un commentaire `// anti-littéral-lib:` sur la même ligne,
 * suivi d'une justification non vide — visible, grep-able, revu comme le
 * reste du code, jamais un moyen silencieux de contourner la règle.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/** Seules valeurs de littéral numérique tolérées où que ce soit dans `src/checks/**`. */
const ALLOWED_LITERAL_VALUES: ReadonlySet<number> = new Set([0, 1]);

/**
 * Marqueur d'exemption RÉSERVÉ à `src/lib/**` (voir l'explication ci-dessus) —
 * ignoré sous `src/checks/**`, qui reste strictement 0/1 sans aucune
 * exemption. Doit apparaître sur la MÊME LIGNE que le littéral, suivi d'une
 * justification non vide (`// anti-littéral-lib: <raison>`).
 */
const LIB_EXEMPTION_MARKER = "anti-littéral-lib:";

function isLibExemptedLine(lineText: string): boolean {
  const markerIndex = lineText.indexOf(LIB_EXEMPTION_MARKER);
  if (markerIndex === -1) return false;
  const justification = lineText.slice(markerIndex + LIB_EXEMPTION_MARKER.length).trim();
  return justification.length > 0;
}

export interface AntiLiteralViolation {
  /** Relatif à `src/` (ex. `checks/core-git-activity/T1.default.ts`). */
  readonly file: string;
  /** 1-indexée. */
  readonly line: number;
  /** 1-indexée. */
  readonly column: number;
  /** Texte source exact du littéral fautif. */
  readonly literalText: string;
}

function listTsFilesRecursively(dirAbs: string): string[] {
  const entries = readdirSync(dirAbs).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const files: string[] = [];
  for (const entry of entries) {
    const entryAbs = join(dirAbs, entry);
    const st = statSync(entryAbs);
    if (st.isDirectory()) {
      files.push(...listTsFilesRecursively(entryAbs));
    } else if (st.isFile() && entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      files.push(entryAbs);
    }
  }
  return files;
}

function isForbiddenNumericLiteral(node: ts.Node): node is ts.NumericLiteral | ts.BigIntLiteral {
  if (!ts.isNumericLiteral(node) && !ts.isBigIntLiteral(node)) {
    return false;
  }
  const text = node.text.endsWith("n") ? node.text.slice(0, -1) : node.text;
  const value = Number(text);
  return !ALLOWED_LITERAL_VALUES.has(value);
}

/** `true` si `fileLabel` (relatif à `src/`) désigne un fichier de `lib/` — seul endroit où {@link LIB_EXEMPTION_MARKER} est honoré. */
function isLibFile(fileLabel: string): boolean {
  return fileLabel === "lib" || fileLabel.startsWith("lib/");
}

function scanSourceFile(sourceFile: ts.SourceFile, fileLabel: string): AntiLiteralViolation[] {
  const violations: AntiLiteralViolation[] = [];
  const exemptable = isLibFile(fileLabel);
  const lines = sourceFile.text.split("\n");

  function visit(node: ts.Node): void {
    if (isForbiddenNumericLiteral(node)) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const lineText = lines[line] ?? "";
      if (!(exemptable && isLibExemptedLine(lineText))) {
        violations.push({
          file: fileLabel,
          line: line + 1,
          column: character + 1,
          literalText: node.getText(sourceFile),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

/**
 * Scanne tous les fichiers `.ts` sous `checksDirAbs` (typiquement `src/checks/`)
 * et rend toutes les violations trouvées, triées déterministiquement (par
 * fichier puis par position — l'ordre de {@link listTsFilesRecursively}, déjà
 * trié par points de code, plus l'ordre de parcours de l'AST, sont tous deux
 * déterministes par construction). Ne lève jamais pour un fichier illisible :
 * une erreur de lecture est remontée comme une violation nommée plutôt qu'un
 * crash du runner d'eval.
 */
export function findAntiLiteralViolations(checksDirAbs: string, labelRootAbs: string = checksDirAbs): readonly AntiLiteralViolation[] {
  const files = listTsFilesRecursively(checksDirAbs);
  const violations: AntiLiteralViolation[] = [];

  for (const fileAbs of files) {
    const fileLabel = relative(labelRootAbs, fileAbs).split("\\").join("/");
    let source: string;
    try {
      source = readFileSync(fileAbs, "utf8");
    } catch (cause) {
      violations.push({
        file: fileLabel,
        line: 1,
        column: 1,
        literalText: `<illisible : ${cause instanceof Error ? cause.message : String(cause)}>`,
      });
      continue;
    }
    const sourceFile = ts.createSourceFile(fileAbs, source, ts.ScriptTarget.ES2022, true);
    violations.push(...scanSourceFile(sourceFile, fileLabel));
  }

  return violations;
}

export function formatAntiLiteralViolation(violation: AntiLiteralViolation): string {
  return `${violation.file}:${violation.line}:${violation.column} — littéral numérique interdit (${violation.literalText}), hors 0/1.`;
}

const here = dirname(fileURLToPath(import.meta.url));
const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolveArgvPath(process.argv[1]);

function resolveArgvPath(argvPath: string): string {
  try {
    return fileURLToPath(new URL(argvPath, "file://"));
  } catch {
    return argvPath;
  }
}

if (isMainModule) {
  const checksDirAbs = join(here, "..", "src", "checks");
  const libDirAbs = join(here, "..", "src", "lib");
  const srcAbs = join(here, "..", "src");
  const violations = [...findAntiLiteralViolations(checksDirAbs, srcAbs), ...findAntiLiteralViolations(libDirAbs, srcAbs)];
  if (violations.length === 0) {
    process.stdout.write("[anti-literal] aucun littéral numérique hors 0/1 sous src/checks/ et src/lib/ (hors exemptions justifiées de src/lib/).\n");
    process.exitCode = 0;
  } else {
    process.stderr.write(`[anti-literal] ${violations.length} violation(s) :\n`);
    for (const violation of violations) {
      process.stderr.write(`  - ${formatAntiLiteralViolation(violation)}\n`);
    }
    process.exitCode = 1;
  }
}
