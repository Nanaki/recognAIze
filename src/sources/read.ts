/**
 * Primitives de lecture bornée et tolérante du système de fichiers, partagées par
 * tous les adaptateurs de `src/sources/*`.
 *
 * Règle `.claude/rules/fiabilite.md` : « Aucune exception ne traverse une
 * frontière : `sources/*` → `{ok,data}|{ok:false,warning}` ». Chaque fonction
 * publique de ce module respecte ce contrat — un cas limite ou hostile (symlink
 * sortant, fichier trop gros, plafond de fichiers atteint, encodage illisible,
 * erreur `fs` imprévue) produit toujours un `ReadWarning` structuré
 * `{code, file, cause}`, jamais une exception qui remonte à l'appelant.
 *
 * Ce module ne fait AUCUN parsing JSON/Markdown — il rend du texte normalisé
 * (BOM retiré, UTF-16 décodé si BOM présent, CRLF → LF, espaces insécables →
 * espace normal). Le parsing par pièce (`profile.ts`, `git-activity.ts`, …)
 * est le travail des adaptateurs eux-mêmes.
 */

import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

/** Fichiers > 2 Mo ignorés (spec §« Jamais de plantage sur un profil »). */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** `code/` et `repo-context/` bornés à 200 fichiers texte chacun. */
export const MAX_TEXT_FILES_PER_TREE = 200;

/**
 * Nombre d'octets sniffés en tête de fichier pour la détection binaire
 * (voir {@link looksBinary}) — même seuil que `buffer_is_binary()` de git.
 */
const BINARY_SNIFF_BYTES = 8000;

export type ReadWarningCode =
  | "symlink_escapes_root"
  | "file_too_large"
  | "non_text_skipped"
  | "encoding_unreadable"
  | "text_file_cap_reached"
  | "read_error";

/** Avertissement structuré — jamais d'exception, toujours ce triplet nommé. */
export interface ReadWarning {
  readonly code: ReadWarningCode;
  /** Chemin relatif au dossier analysé (racine passée à la fonction appelée). */
  readonly file: string;
  readonly cause: string;
}

/** Frontière `{ok,data}|{ok:false,warning}` imposée par `.claude/rules/fiabilite.md`. */
export type ReadResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly warning: ReadWarning };

export interface TextTreeFile {
  readonly relPath: string;
  readonly content: string;
}

export interface TextTreeResult {
  readonly files: readonly TextTreeFile[];
  readonly warnings: readonly ReadWarning[];
}

function makeWarning(code: ReadWarningCode, file: string, cause: string): ReadWarning {
  return { code, file, cause };
}

// Le message brut de Node (`err.message`) pour une erreur `fs` embarque
// systématiquement le chemin ABSOLU de la machine (ex. `ENOENT: no such file
// or directory, lstat '/home/<user>/…'`). Interpolé tel quel dans
// `warnings[].cause`, il fuirait un chemin absolu du système de la personne qui
// a exécuté l'outil (et un tel warning se retrouve dans `result.json`, donc
// potentiellement dans un rapport partagé). Un `ReadWarning` porte déjà le
// chemin RELATIF pertinent dans `warning.file` (voir {@link ReadWarning}) —
// jamais besoin du message Node brut pour localiser le problème. Ne rend donc
// jamais le message d'erreur original : uniquement un message générique,
// éventuellement qualifié par `err.code` (`ENOENT`, `EACCES`, `ELOOP`, …) qui
// ne contient aucun chemin.
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code ? `erreur de lecture (${code})` : "erreur de lecture inattendue";
  }
  return "erreur de lecture inattendue";
}

/** `.sort()` par points de code (pas `localeCompare`) — déterminisme inter-machines. */
function compareByCodePoint(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** `readdirSync` puis `.sort()` — requis après TOUT `readdir` (fiabilite.md). */
export function readdirSorted(dirAbs: string): string[] {
  return readdirSync(dirAbs).sort(compareByCodePoint);
}

function toRelPath(rootAbs: string, targetAbs: string): string {
  const rel = relative(rootAbs, targetAbs);
  return rel === "" ? "." : rel;
}

/** `true` si `candidateAbs` est `rootAbs` ou se trouve strictement en dessous. */
function isInsideRoot(candidateAbs: string, rootAbs: string): boolean {
  if (candidateAbs === rootAbs) {
    return true;
  }
  const rel = relative(rootAbs, candidateAbs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

// `realpathSync(rootAbs)` peut lever si `rootAbs` a disparu sous nos pieds
// entre deux appels — jamais laisser une exception traverser la frontière
// pour un simple calcul de confinement. Repli sur `rootAbs` lui-même
// (comparaison la moins permissive possible dans ce cas dégénéré).
function realOrSelf(pathAbs: string): string {
  try {
    return realpathSync(pathAbs);
  } catch {
    return pathAbs;
  }
}

/**
 * Résout CANONIQUEMENT `absPath` (`realpathSync`, qui résout TOUS les
 * composants du chemin, pas seulement le dernier) et refuse (avertissement, pas
 * d'exception) toute cible dont le chemin réel tombe EN DEHORS du chemin réel de
 * `rootAbs`. Rend le chemin réel à lire.
 *
 * Vérifier uniquement si `absPath` lui-même est un lien symbolique ne suffit
 * pas : un répertoire INTERMÉDIAIRE symlinké hors racine (ex. `repo-context/`
 * lui-même pointant hors du dossier de profil analysé) ne serait alors jamais
 * détecté, puisque le dernier composant du chemin n'est pas lui-même un lien.
 * `realpathSync` résout la totalité de la chaîne (chaque composant, à chaque
 * niveau) — un seul appel, systématique, remplace la distinction « est-ce un
 * lien ? ».
 */
function checkSymlinkSafety(rootAbs: string, absPath: string, relPath: string): ReadResult<string> {
  try {
    const rootReal = realOrSelf(rootAbs);
    const real = realpathSync(absPath);
    if (!isInsideRoot(real, rootReal)) {
      return {
        ok: false,
        warning: makeWarning(
          "symlink_escapes_root",
          relPath,
          "lien symbolique résolu hors du dossier analysé — cible non affichée pour ne pas exposer un chemin absolu du système.",
        ),
      };
    }
    return { ok: true, data: real };
  } catch (err) {
    return { ok: false, warning: makeWarning("read_error", relPath, describeError(err)) };
  }
}

/**
 * Heuristique de détection binaire : présence d'un octet nul dans les
 * {@link BINARY_SNIFF_BYTES} premiers octets — même seuil que `buffer_is_binary()`
 * de git, choisi car il ne nécessite aucune liste d'extensions à maintenir et
 * fonctionne pour n'importe quel format binaire (images, archives, exécutables).
 *
 * Cette même heuristique classe aussi un fichier UTF-16 (BOM ou non — un texte
 * ASCII encodé en UTF-16 contient ~50% d'octets nuls) comme « binaire ». Dans
 * les arborescences `code/`/`repo-context/`, un tel fichier est donc sauté
 * comme non-texte plutôt que décodé — limitation acceptable : le code source y
 * est quasi systématiquement UTF-8/ASCII. La détection UTF-16 réelle (voir
 * {@link decodeText}) reste correcte pour la lecture d'une pièce nommée
 * (`profile.json`, `session.md`, …), qui ne passe jamais par cette heuristique.
 */
function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, BINARY_SNIFF_BYTES));
  return sample.includes(0);
}

/**
 * Heuristique « ressemble à de l'UTF-16 sans BOM » : sur un échantillon de tête,
 * un texte ASCII encodé en UTF-16LE a un octet nul à quasi CHAQUE position impaire
 * et quasi jamais à une position paire (l'inverse pour UTF-16BE). Seuils choisis
 * larges (>60% d'un côté, <5% de l'autre) pour ne déclencher que sur un cas net,
 * jamais sur de l'UTF-8 contenant occasionnellement des octets nuls.
 */
function looksLikeUtf16NoBom(buf: Buffer): boolean {
  if (buf.length < 4 || buf.length % 2 !== 0) {
    return false;
  }
  const sampleLen = Math.min(buf.length, 512);
  const pairs = Math.floor(sampleLen / 2);
  if (pairs < 2) {
    return false;
  }
  let zerosAtEven = 0;
  let zerosAtOdd = 0;
  for (let i = 0; i < pairs * 2; i += 2) {
    if (buf[i] === 0) zerosAtEven += 1;
    if (buf[i + 1] === 0) zerosAtOdd += 1;
  }
  const rateEven = zerosAtEven / pairs;
  const rateOdd = zerosAtOdd / pairs;
  const looksLE = rateOdd > 0.6 && rateEven < 0.05;
  const looksBE = rateEven > 0.6 && rateOdd < 0.05;
  return looksLE || looksBE;
}

/** Échange chaque paire d'octets en place — UTF-16BE -> UTF-16LE avant `toString`. */
function swapBytePairsInPlace(buf: Buffer): void {
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const tmp = buf[i]!;
    buf[i] = buf[i + 1]!;
    buf[i + 1] = tmp;
  }
}

/**
 * CRLF → LF et espaces insécables → espace normal. Volontairement restreint à
 * U+00A0 (NBSP), U+2007 (FIGURE SPACE) et U+202F (NARROW NO-BREAK SPACE) — les
 * variantes réellement rencontrées en copier-coller depuis un traitement de texte
 * ou une page web ; U+FEFF n'est PAS touché ici (BOM, déjà géré en tête de fichier
 * par {@link decodeText}, jamais normalisé s'il apparaît en plein milieu du texte).
 */
function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[\u00A0\u2007\u202F]/g, " ");
}

/**
 * Décode un buffer en texte normalisé : BOM UTF-8 retiré (silencieux), BOM UTF-16
 * (LE ou BE) détecté et décodé (silencieux), sinon — si le contenu RESSEMBLE à de
 * l'UTF-16 sans BOM — refusé comme illisible (avertissement, aucune tentative de
 * décodage hasardeux), sinon décodé en UTF-8. `relPath` sert uniquement à nommer
 * l'avertissement éventuel.
 */
export function decodeText(buf: Buffer, relPath: string): ReadResult<string> {
  try {
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      return { ok: true, data: normalizeText(buf.subarray(3).toString("utf8")) };
    }
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
      return { ok: true, data: normalizeText(buf.subarray(2).toString("utf16le")) };
    }
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      const swapped = Buffer.from(buf.subarray(2));
      swapBytePairsInPlace(swapped);
      return { ok: true, data: normalizeText(swapped.toString("utf16le")) };
    }
    if (looksLikeUtf16NoBom(buf)) {
      return {
        ok: false,
        warning: makeWarning(
          "encoding_unreadable",
          relPath,
          "ressemble à de l'UTF-16 sans BOM — encodage non fiable, non décodé (pas de devinette).",
        ),
      };
    }
    return { ok: true, data: normalizeText(buf.toString("utf8")) };
  } catch (err) {
    return { ok: false, warning: makeWarning("read_error", relPath, describeError(err)) };
  }
}

/**
 * Lit un fichier NOMMÉ (`profile.json`, `session.md`, …) sous `root`, borné et
 * tolérant : lien symbolique sortant refusé, taille vérifiée par `statSync` AVANT
 * toute lecture de contenu, texte décodé et normalisé. Ne lève jamais — toute
 * erreur `fs` imprévue (y compris un chemin structurellement invalide) est
 * capturée par le filet défensif final et rendue en `{ok:false, warning}`.
 */
export function readBoundedText(root: string, absPath: string): ReadResult<string> {
  const rootAbs = resolve(root);
  const relPath = toRelPath(rootAbs, absPath);
  try {
    const safety = checkSymlinkSafety(rootAbs, absPath, relPath);
    if (!safety.ok) {
      return safety;
    }
    const realAbs = safety.data;

    const st = statSync(realAbs);
    if (!st.isFile()) {
      return { ok: false, warning: makeWarning("read_error", relPath, "n'est pas un fichier régulier") };
    }
    if (st.size > MAX_FILE_BYTES) {
      return {
        ok: false,
        warning: makeWarning(
          "file_too_large",
          relPath,
          `taille ${st.size} o > plafond ${MAX_FILE_BYTES} o`,
        ),
      };
    }

    const buf = readFileSync(realAbs);
    return decodeText(buf, relPath);
  } catch (err) {
    // Filet défensif : AUCUNE exception (fs imprévue, chemin invalide, etc.) ne
    // doit jamais traverser cette frontière — voir test/sources/read.test.ts,
    // cas « la frontière elle-même est défensive ».
    return { ok: false, warning: makeWarning("read_error", relPath, describeError(err)) };
  }
}

/**
 * Parcourt récursivement `subtreeAbs` (sous `root`) et rend au plus `cap` fichiers
 * texte lus et décodés, triés déterministiquement (`.sort()` à chaque niveau).
 *
 * Règles :
 * - Un fichier détecté binaire ({@link looksBinary}) est sauté et NE COMPTE PAS
 *   dans le plafond de `cap` fichiers texte — seuls des fichiers texte
 *   effectivement lus et décodés comptent, cohérent avec l'énoncé « bornés à 200
 *   fichiers TEXTE ».
 * - Un lien symbolique interne (résout dans `root`) est suivi ; un lien sortant
 *   produit un avertissement et est sauté, sans compter contre le plafond.
 * - Un fichier > 2 Mo produit un avertissement et est sauté, sans compter contre
 *   le plafond.
 * - Dès que `cap` fichiers texte ont été lus, un UNIQUE avertissement
 *   `text_file_cap_reached` est ajouté et le reste de l'arborescence n'est plus
 *   parcouru (pas un avertissement par fichier restant, ce qui serait un bruit
 *   proportionnel à la taille du dépôt).
 */
export function readTextTreeBounded(
  root: string,
  subtreeAbs: string,
  cap: number = MAX_TEXT_FILES_PER_TREE,
): TextTreeResult {
  const rootAbs = resolve(root);
  // Comparer contre le chemin RÉEL de la racine, pas son chemin lexical —
  // cohérent avec `checkSymlinkSafety`.
  const rootReal = realOrSelf(rootAbs);
  const files: TextTreeFile[] = [];
  const warnings: ReadWarning[] = [];
  let capReached = false;

  // `walk()` parcourt le sous-arbre déjà canonicalisé (`realpathSync`, résolu
  // à travers les symlinks) : TOUT `relPath` de cette fonction doit donc être
  // calculé contre ce même chemin réel (`rootReal`, déjà en place pour le
  // confinement), jamais contre la racine LEXICALE non résolue — sinon, dès
  // que le dossier analysé lui-même est atteint via un chemin traversant un
  // symlink (cas standard : `TMPDIR` symlinké sur macOS, donc tout
  // `os.tmpdir()`), les deux chemins divergent et `relative()` rend un chemin
  // qui remonte hors racine (`../../…`) au lieu d'un `relPath` propre.
  // `subtreeAbsResolved` ci-dessous, à l'inverse, n'est délibérément JAMAIS
  // résolu à travers un symlink échappant (sinon on exposerait le chemin
  // absolu externe) — les deux branches d'erreur qui l'utilisent tel quel
  // restent donc comparées à `rootAbs` (LEXICAL, cohérent avec un chemin
  // lui-même non résolu), pas à `rootReal`. Seule la référence de calcul de
  // `relPath` change, pour le sous-arbre RÉSOLU ET confirmé dans la racine ;
  // le confinement anti-échappement reste inchangé.
  const subtreeAbsResolved = resolve(subtreeAbs);
  let subtreeReal: string;
  try {
    subtreeReal = realpathSync(subtreeAbsResolved);
  } catch (err) {
    // Filet défensif : voir readBoundedText — même garantie ici (ex. chemin
    // hostile contenant un octet nul, cf. test/sources/read.test.ts).
    warnings.push(makeWarning("read_error", toRelPath(rootAbs, subtreeAbsResolved), describeError(err)));
    return { files, warnings };
  }
  if (!isInsideRoot(subtreeReal, rootReal)) {
    warnings.push(
      makeWarning(
        "symlink_escapes_root",
        toRelPath(rootAbs, subtreeAbsResolved),
        "lien symbolique résolu hors du dossier analysé — cible non affichée pour ne pas exposer un chemin absolu du système.",
      ),
    );
    return { files, warnings };
  }
  const subtreeRelPath = toRelPath(rootReal, subtreeReal);

  function recordCapIfReached(): void {
    if (!capReached && files.length >= cap) {
      capReached = true;
      warnings.push(
        makeWarning(
          "text_file_cap_reached",
          subtreeRelPath,
          `plafond de ${cap} fichiers texte atteint — le reste de l'arborescence est ignoré.`,
        ),
      );
    }
  }

  function processFile(fileAbs: string, relPath: string, size: number): void {
    if (capReached) {
      return;
    }
    if (size > MAX_FILE_BYTES) {
      warnings.push(
        makeWarning("file_too_large", relPath, `taille ${size} o > plafond ${MAX_FILE_BYTES} o`),
      );
      return;
    }
    let buf: Buffer;
    try {
      buf = readFileSync(fileAbs);
    } catch (err) {
      warnings.push(makeWarning("read_error", relPath, describeError(err)));
      return;
    }
    if (looksBinary(buf)) {
      warnings.push(
        makeWarning(
          "non_text_skipped",
          relPath,
          "détecté binaire (octet nul dans les 8000 premiers octets) — ne compte pas dans le plafond de fichiers texte.",
        ),
      );
      return;
    }
    const decoded = decodeText(buf, relPath);
    if (!decoded.ok) {
      warnings.push(decoded.warning);
      return;
    }
    files.push({ relPath, content: decoded.data });
  }

  function walk(dirAbs: string): void {
    if (capReached) {
      return;
    }
    let entries: string[];
    try {
      entries = readdirSorted(dirAbs);
    } catch (err) {
      warnings.push(makeWarning("read_error", toRelPath(rootReal, dirAbs), describeError(err)));
      return;
    }

    for (const name of entries) {
      if (capReached) {
        return;
      }
      const entryAbs = join(dirAbs, name);
      const relPath = toRelPath(rootReal, entryAbs);

      let lst;
      try {
        lst = lstatSync(entryAbs);
      } catch (err) {
        warnings.push(makeWarning("read_error", relPath, describeError(err)));
        continue;
      }

      if (lst.isSymbolicLink()) {
        let real: string;
        try {
          real = realpathSync(entryAbs);
        } catch (err) {
          warnings.push(makeWarning("read_error", relPath, describeError(err)));
          continue;
        }
        if (!isInsideRoot(real, rootReal)) {
          warnings.push(
            makeWarning(
              "symlink_escapes_root",
              relPath,
              "lien symbolique résolu hors du dossier analysé — cible non affichée pour ne pas exposer un chemin absolu du système.",
            ),
          );
          continue;
        }
        let realStat;
        try {
          realStat = statSync(real);
        } catch (err) {
          warnings.push(makeWarning("read_error", relPath, describeError(err)));
          continue;
        }
        if (realStat.isDirectory()) {
          walk(real);
        } else if (realStat.isFile()) {
          processFile(real, relPath, realStat.size);
          recordCapIfReached();
        }
        continue;
      }

      if (lst.isDirectory()) {
        walk(entryAbs);
        continue;
      }
      if (lst.isFile()) {
        processFile(entryAbs, relPath, lst.size);
        recordCapIfReached();
      }
      // Autre type d'entrée (socket, FIFO, périphérique…) : ignorée
      // silencieusement, hors périmètre d'un dossier de profil.
    }
  }

  // `walk()` ne `lstat`e que les ENTRÉES qu'il découvre par `readdir` —
  // jamais `subtreeAbs` lui-même. Si `subtreeAbs` (ex. `repo-context/` ou
  // `repo-context/.claude/agents`) est ATTEINT via un répertoire ancêtre
  // symlinké hors racine, le lien n'est ni `subtreeAbs` ni un des chemins
  // parcourus par `walk`, donc jamais vu par une garde qui ne vérifierait que
  // les entrées découvertes — le contenu externe serait alors lu en silence,
  // sans aucun avertissement. `realpathSync` résout la chaîne ENTIÈRE (chaque
  // composant, à chaque niveau) — voir le calcul de `subtreeReal` en tête de
  // fonction, qui sert ici ET comme référence de `relPath`. `walk()` ne reçoit
  // que ce chemin déjà validé et réel.
  try {
    walk(subtreeReal);
  } catch (err) {
    // Filet défensif : voir readBoundedText — même garantie ici (exception fs
    // imprévue survenant PENDANT le parcours, pas avant).
    warnings.push(makeWarning("read_error", subtreeRelPath, describeError(err)));
  }

  return { files, warnings };
}
