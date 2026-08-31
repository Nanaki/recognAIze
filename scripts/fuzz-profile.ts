/**
 * `scripts/fuzz-profile.ts` — Fuzzer maison : génère un nombre fixe de
 * mutants (par défaut 200, {@link MUTANT_COUNT}) dérivés UNIQUEMENT des 4
 * étalons réels (`fixtures/profiles/{perceval,bohort,leodagan,arthur}/`),
 * avec une graine fixe ({@link FUZZ_SEED}, PRNG `mulberry32` — aucune
 * dépendance externe, déterministe bit à bit) pour que la même graine
 * produise EXACTEMENT les mêmes 200 mutants d'une exécution à l'autre.
 *
 * Types de mutation :
 *   - `delete-key` : supprime une clé JSON prise au hasard (objet, pas tableau) ;
 *   - `delete-file` : supprime un fichier entier, jamais `profile.json` ;
 *   - `swap-type` : échange le type d'un champ (nombre -> chaîne, chaîne ->
 *     nombre, objet -> tableau structurellement plausible via `Object.values`) ;
 *   - `stringify-numbers` : convertit TOUS les nombres d'un fichier JSON en
 *     chaînes (mutation « en gros », par opposition à `swap-type` qui ne
 *     touche qu'UN champ) ;
 *   - `empty-array` : vide un tableau non vide.
 *
 * Chaque mutant applique 1 à 3 mutations (choix pseudo-aléatoire, même graine)
 * et CONSERVE TOUJOURS `profile.json` — jamais ciblé par `delete-file` : un
 * mutant sans `profile.json` du tout n'est pas un cas de test intéressant,
 * déjà couvert par ailleurs par le cas « dossier vide »/« profile.json seul »
 * de `test/e2e-jury.test.ts`.
 *
 * `buildMutants` est une fonction PURE côté résultat (mêmes entrées ⇒ même
 * plan de mutations, même graine) mais fait de l'E/S réelle (écrit les 200
 * dossiers de mutants sur disque, sous `destRootAbs` fourni par l'appelant —
 * jamais un chemin en dur, jamais `recognaize-cli-out/`) : `test/fuzz.test.ts` lui
 * fournit un répertoire temporaire (`mkdtempSync`), jamais un dossier commité.
 */

import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

/** Graine fixe — voir la docstring de fichier pour la garantie de reproductibilité. */
export const FUZZ_SEED = 20260829;
export const MUTANT_COUNT = 200;

export const ETALON_NAMES = ["perceval", "bohort", "leodagan", "arthur"] as const;
export type EtalonName = (typeof ETALON_NAMES)[number];

export function etalonDir(name: EtalonName): string {
  return join(REPO_ROOT, "fixtures", "profiles", name);
}

export interface MutantPlan {
  readonly index: number;
  readonly name: string;
  readonly profile: EtalonName;
  readonly dir: string;
  /** Description humaine de chaque mutation appliquée, dans l'ordre — pour un diagnostic de test lisible. */
  readonly mutations: readonly string[];
}

/**
 * PRNG déterministe `mulberry32` (domaine public) — aucune dépendance
 * externe, aucun accès à `Math.random()` (non reproductible), même sortie
 * pour une même graine sur toute version de Node ≥ 20.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Index déterministe dans `[0, length)`, jamais `length` lui-même (bornage explicite contre l'arrondi flottant à la marge supérieure). */
function pickIndex(rng: () => number, length: number): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}

/** Parcourt récursivement `dirAbs`, renvoie les chemins de FICHIERS relatifs (jamais les dossiers), triés — déterministe indépendamment de l'ordre du système de fichiers. */
function listFilesRecursive(dirAbs: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of [...readdirSync(dirAbs)].sort()) {
    const abs = join(dirAbs, entry);
    const rel = prefix.length > 0 ? `${prefix}/${entry}` : entry;
    const st = statSync(abs);
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(abs, rel));
    } else if (st.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

interface KeyRef {
  readonly parent: Record<string, unknown>;
  readonly key: string;
  readonly path: string;
}

/** Collecte toute clé d'objet (jamais un index de tableau) atteignable depuis `value`, triée par ordre de clé pour rester déterministe. */
function collectObjectKeyRefs(value: unknown, path: readonly string[], out: KeyRef[]): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectObjectKeyRefs(item, [...path, String(i)], out));
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record).sort()) {
    out.push({ parent: record, key, path: [...path, key].join(".") });
    collectObjectKeyRefs(record[key], [...path, key], out);
  }
}

interface TypedRef {
  readonly parent: Record<string, unknown>;
  readonly key: string;
  readonly path: string;
  readonly value: unknown;
}

/** Collecte toute valeur (clé d'objet OU index de tableau) satisfaisant `predicate`, atteignable depuis `value` — racine exclue (aucun parent à réassigner). */
function collectByPredicate(
  value: unknown,
  predicate: (v: unknown) => boolean,
  parent: Record<string, unknown> | undefined,
  key: string | undefined,
  path: readonly string[],
  out: TypedRef[],
): void {
  if (parent !== undefined && key !== undefined && predicate(value)) {
    out.push({ parent, key, path: path.join("."), value });
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      collectByPredicate(item, predicate, value as unknown as Record<string, unknown>, String(i), [...path, String(i)], out),
    );
    return;
  }
  const record = value as Record<string, unknown>;
  for (const k of Object.keys(record).sort()) {
    collectByPredicate(record[k], predicate, record, k, [...path, k], out);
  }
}

function readJson(abs: string): unknown {
  return JSON.parse(readFileSync(abs, "utf8"));
}

function writeJson(abs: string, data: unknown): void {
  writeFileSync(abs, JSON.stringify(data));
}

/** `delete-key` : supprime une clé d'objet prise au hasard dans un fichier JSON pris au hasard. */
function mutateDeleteKey(mutantDir: string, jsonRelFiles: readonly string[], rng: () => number): string | undefined {
  if (jsonRelFiles.length === 0) return undefined;
  const fileRel = jsonRelFiles[pickIndex(rng, jsonRelFiles.length)]!;
  const abs = join(mutantDir, fileRel);
  const data = readJson(abs);
  const refs: KeyRef[] = [];
  collectObjectKeyRefs(data, [], refs);
  if (refs.length === 0) return undefined;
  const ref = refs[pickIndex(rng, refs.length)]!;
  delete ref.parent[ref.key];
  writeJson(abs, data);
  return `delete-key:${fileRel}#${ref.path}`;
}

/** `delete-file` : supprime un fichier entier, jamais `profile.json` (invariant « conservation de profile.json »). */
function mutateDeleteFile(mutantDir: string, allRelFiles: readonly string[], rng: () => number): string | undefined {
  const candidates = allRelFiles.filter((f) => f !== "profile.json");
  if (candidates.length === 0) return undefined;
  const rel = candidates[pickIndex(rng, candidates.length)]!;
  rmSync(join(mutantDir, rel));
  return `delete-file:${rel}`;
}

/** `swap-type` : échange le type d'UN champ (nombre -> chaîne, chaîne -> nombre, objet -> tableau via `Object.values`). */
function mutateSwapType(mutantDir: string, jsonRelFiles: readonly string[], rng: () => number): string | undefined {
  if (jsonRelFiles.length === 0) return undefined;
  const fileRel = jsonRelFiles[pickIndex(rng, jsonRelFiles.length)]!;
  const abs = join(mutantDir, fileRel);
  const data = readJson(abs);
  const refs: TypedRef[] = [];
  collectByPredicate(
    data,
    (v) => typeof v === "number" || typeof v === "string" || (v !== null && typeof v === "object" && !Array.isArray(v)),
    undefined,
    undefined,
    [],
    refs,
  );
  if (refs.length === 0) return undefined;
  const ref = refs[pickIndex(rng, refs.length)]!;
  let replacement: unknown;
  let kind: string;
  if (typeof ref.value === "number") {
    replacement = String(ref.value);
    kind = "number->string";
  } else if (typeof ref.value === "string") {
    const parsed = Number(ref.value);
    replacement = ref.value.length > 0 && !Number.isNaN(parsed) ? parsed : 42;
    kind = "string->number";
  } else {
    replacement = Object.values(ref.value as Record<string, unknown>);
    kind = "object->array";
  }
  ref.parent[ref.key] = replacement;
  writeJson(abs, data);
  return `swap-type(${kind}):${fileRel}#${ref.path}`;
}

/** `stringify-numbers` : convertit TOUS les nombres d'un fichier JSON pris au hasard en chaînes — mutation « en gros », distincte de `swap-type` (un seul champ). */
function mutateStringifyNumbers(mutantDir: string, jsonRelFiles: readonly string[], rng: () => number): string | undefined {
  if (jsonRelFiles.length === 0) return undefined;
  const fileRel = jsonRelFiles[pickIndex(rng, jsonRelFiles.length)]!;
  const abs = join(mutantDir, fileRel);
  const data = readJson(abs);
  const refs: TypedRef[] = [];
  collectByPredicate(data, (v) => typeof v === "number", undefined, undefined, [], refs);
  if (refs.length === 0) return undefined;
  for (const ref of refs) {
    ref.parent[ref.key] = String(ref.value);
  }
  writeJson(abs, data);
  return `stringify-numbers:${fileRel}#${refs.length} nombre(s)`;
}

/** `empty-array` : vide un tableau non vide pris au hasard. */
function mutateEmptyArray(mutantDir: string, jsonRelFiles: readonly string[], rng: () => number): string | undefined {
  if (jsonRelFiles.length === 0) return undefined;
  const fileRel = jsonRelFiles[pickIndex(rng, jsonRelFiles.length)]!;
  const abs = join(mutantDir, fileRel);
  const data = readJson(abs);
  const refs: TypedRef[] = [];
  collectByPredicate(data, (v) => Array.isArray(v) && v.length > 0, undefined, undefined, [], refs);
  if (refs.length === 0) return undefined;
  const ref = refs[pickIndex(rng, refs.length)]!;
  ref.parent[ref.key] = [];
  writeJson(abs, data);
  return `empty-array:${fileRel}#${ref.path}`;
}

type MutationKind = "delete-key" | "delete-file" | "swap-type" | "stringify-numbers" | "empty-array";
const MUTATION_KINDS: readonly MutationKind[] = ["delete-key", "delete-file", "swap-type", "stringify-numbers", "empty-array"];

/** Recalcule les listes de fichiers À CHAQUE mutation (une mutation précédente a pu en supprimer un) puis applique une mutation choisie au hasard. */
function applyRandomMutation(mutantDir: string, rng: () => number): string {
  const allFiles = listFilesRecursive(mutantDir);
  const jsonFiles = allFiles.filter((f) => f.endsWith(".json"));
  const kind = MUTATION_KINDS[pickIndex(rng, MUTATION_KINDS.length)]!;

  let description: string | undefined;
  switch (kind) {
    case "delete-key":
      description = mutateDeleteKey(mutantDir, jsonFiles, rng);
      break;
    case "delete-file":
      description = mutateDeleteFile(mutantDir, allFiles, rng);
      break;
    case "swap-type":
      description = mutateSwapType(mutantDir, jsonFiles, rng);
      break;
    case "stringify-numbers":
      description = mutateStringifyNumbers(mutantDir, jsonFiles, rng);
      break;
    case "empty-array":
      description = mutateEmptyArray(mutantDir, jsonFiles, rng);
      break;
  }
  return description ?? `${kind}:sans-effet (aucun candidat trouvé pour ce tirage)`;
}

/**
 * Génère `count` mutants (défaut {@link MUTANT_COUNT}) sous `destRootAbs`,
 * dérivés cycliquement des 4 étalons (`ETALON_NAMES`, ~50 mutants chacun pour
 * `count = 200`) avec 1 à 3 mutations par mutant, entièrement déterministe
 * pour une `seed` donnée. `profile.json` est garanti présent en sortie pour
 * chaque mutant (vérifié explicitement, jamais supposé) — voir la docstring
 * de fichier.
 */
export function buildMutants(destRootAbs: string, seed: number = FUZZ_SEED, count: number = MUTANT_COUNT): readonly MutantPlan[] {
  const rng = mulberry32(seed);
  const plans: MutantPlan[] = [];

  for (let index = 0; index < count; index += 1) {
    const profile = ETALON_NAMES[index % ETALON_NAMES.length]!;
    const name = `mutant-${String(index).padStart(4, "0")}-${profile}`;
    const dir = join(destRootAbs, name);
    cpSync(etalonDir(profile), dir, { recursive: true });

    const mutationCount = 1 + pickIndex(rng, 3); // 1..3 mutations, déterministe.
    const mutations: string[] = [];
    for (let m = 0; m < mutationCount; m += 1) {
      mutations.push(applyRandomMutation(dir, rng));
    }

    if (!existsSync(join(dir, "profile.json"))) {
      throw new Error(
        `mutant "${name}" : profile.json manquant après mutation — violation de l'invariant ` +
          `"conservation de profile.json". mutateDeleteFile exclut pourtant explicitement ` +
          `"profile.json" de ses candidats — ceci indique un défaut du fuzzer lui-même.`,
      );
    }

    plans.push({ index, name, profile, dir, mutations });
  }

  return plans;
}

function isDirectExecution(): boolean {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(HERE, "fuzz-profile.ts");
}

if (isDirectExecution()) {
  const destArg = process.argv[2] ?? join(REPO_ROOT, ".fuzz-manifest-tmp");
  const destAbs = resolve(destArg);
  const plans = buildMutants(destAbs);
  process.stdout.write(`[fuzz-profile] ${plans.length} mutants générés sous ${destAbs} (graine ${FUZZ_SEED}).\n`);
  for (const plan of plans) {
    process.stdout.write(`  - ${plan.name} <- ${plan.profile} : ${plan.mutations.join(" | ")}\n`);
  }
}
