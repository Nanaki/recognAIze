/**
 * Vocabulaire métier partagé par `core/referentiel.ts`, `core/registry.ts` et
 * `core/judge.ts`. Identifiants stables (`T2`, `T2.p1`, `GA.size_median`) —
 * utilisés par les fixtures négatives, voir `aidd_docs/memory/architecture.md`.
 *
 * `import type` uniquement vers `./referentiel.js` (Check.run) : entièrement
 * effacé à la compilation (`verbatimModuleSyntax`), donc aucun cycle au runtime —
 * même schéma que `core/referentiel.ts`, qui importe déjà `./types.js` en `type`.
 */

import type { Referentiel } from "./referentiel.js";
import type { DeclaratifData } from "../sources/declaratif.js";
import type { GitActivityData } from "../sources/git-activity.js";
import type { ProfileData } from "../sources/profile.js";
import type { PullRequestsData } from "../sources/pull-requests.js";
import type { RepoContextData } from "../sources/repo-context.js";
import type { SessionDigest } from "../sources/session.js";
import type { SonarData } from "../sources/sonar.js";

/** Un des 5 axes officiels de la grille laivel-up plus Ownership (affiché, hors ligne de montée). */
export type AxeId = "T" | "H" | "I" | "P" | "O";

/**
 * Source d'une Evidence, avec sa `confiance_source` figée dans `referentiel.json`.
 * `SU` (« Setup ») : contenu déclaré d'un artefact de harness (skill/agent
 * spécifique du repo-context) lu comme indice FAIBLE de taille/intervention —
 * jamais une observation de comportement réel (voir `SOURCE_PRECEDENCE`,
 * `core/judge.ts` : positionnée sous `GA`/`PR`/`S` pour ne jamais écraser une
 * preuve/contre-preuve de comportement observé, seulement combler `inconnu`).
 */
export type SourceId = "GA" | "PR" | "RC" | "S" | "SO" | "SU" | "DEC";

/** Force d'une preuve positive : trace récurrente (prouvé) ou observation isolée (indice). */
export type Force = "prouve" | "indice";

/** Polarité d'une Evidence vis-à-vis de la marche qu'elle documente. */
export type Polarite = "preuve" | "contre-preuve";

/**
 * Les 6 états d'une marche, par priorité décroissante :
 * infirmé > prouvé > indice > compris > déclaré > inconnu.
 * « compris » est réservé à l'entretien (hors périmètre de ce run) et n'apparaît
 * jamais dans une exécution du chemin jury.
 */
export type Etat = "infirmé" | "prouvé" | "indice" | "compris" | "déclaré" | "inconnu";

/** Rangs de la grille laivel-up, du plus bas au plus haut. */
export type Rang = "white" | "red" | "blue" | "green" | "copper" | "silver" | "gold";

export const RANGS_ORDONNES: readonly Rang[] = [
  "white",
  "red",
  "blue",
  "green",
  "copper",
  "silver",
  "gold",
];

/** Sens de comparaison d'un seuil (`referentiel.json`). */
export type Comparator = "gte" | "lte" | "gt" | "lt" | "eq";

/** Type de valeur observée ou seuillée. */
export type ValueType = "number" | "ratio" | "count" | "enum" | "boolean";

/** Fourchette de rang : `[rang prouvé ; rang si les inconnues étaient prouvées]`. */
export interface Fourchette {
  readonly bas: Rang;
  readonly haut: Rang;
}

/**
 * Confiance dans `[0 ; 1]`, arrondie à deux décimales : couverture × accord par
 * axe, ou minimum des 4 axes officiels pour la confiance globale.
 */
export type Confiance = number;

/**
 * Une pièce de preuve élémentaire produite par un check et consommée par le juge.
 */
export interface Evidence {
  readonly id: string;
  readonly signal_id: string;
  readonly valeur: {
    readonly type: ValueType;
    readonly unite: string;
  };
  readonly source: SourceId;
  readonly check_id: string;
  readonly path_id: string;
  readonly concept_id: string;
  readonly axe: AxeId;
  readonly polarite: Polarite;
  readonly force: Force;
  readonly citation?: string;
  readonly confiance_source: number;
}

/** État observé d'une marche donnée, tel que produit par le juge. */
export interface EtatMarche {
  readonly marche: string;
  readonly etat: Etat;
}

/** Verdict d'un axe : niveaux, marche bloquante éventuelle, raison chiffrée, états. */
export interface Verdict {
  readonly axe: AxeId;
  readonly niveau_prouve: string | null;
  readonly niveau_ponctuel: string | null;
  readonly marche_bloquante?: string;
  readonly raison: string;
  readonly etats: readonly EtatMarche[];
}

/**
 * Avertissement structuré émis par un adaptateur de `sources/` — même triplet que
 * `ReadWarning` (`src/sources/read.ts`), redéclaré ICI plutôt qu'importé :
 * `core/` définit le contrat que `sources/*` doit satisfaire, jamais l'inverse
 * (architecture.md — « les sources connaissent `core`, pas le contraire »).
 * `code` reste un `string` ouvert (pas une union figée) : chaque adaptateur
 * ajoute ses propres codes (JSON invalide, champ mal typé, structure non
 * reconnue, …) sans jamais devoir toucher `core/types.ts`.
 */
export interface ProfileWarning {
  readonly code: string;
  readonly file: string;
  readonly cause: string;
}

/**
 * Contexte de profil assemblé par les adaptateurs de `sources/` et câblé bout
 * en bout par `src/analyze.ts`. Chaque pièce est optionnelle — absente ou
 * illisible, elle n'apparaît simplement pas ici (jamais d'exception, voir
 * `.claude/rules/fiabilite.md`) — et TYPÉE avec la forme réelle produite par
 * son adaptateur, jamais `unknown`.
 *
 * Les 7 types de pièces sont importés en `import type` depuis `../sources/*.js`
 * — entièrement effacés à la compilation (`verbatimModuleSyntax`, même schéma
 * que l'import déjà présent de `Referentiel` juste au-dessus).
 * `.claude/rules/fiabilite.md` interdit explicitement `core/` → `checks/`,
 * jamais `core/` → `sources/` : le sens de dépendance `sources/*.ts` →
 * `core/types.ts` (pour `ProfileWarning`) crée un cycle d'imports `import
 * type` avec ce fichier, mais un cycle purement type-only est sans effet au
 * runtime (aucune des deux extrémités ne s'importe réellement l'une l'autre
 * une fois `verbatimModuleSyntax` appliqué) — vérifié par `npm run
 * typecheck`/`npm run build`. Ne jamais transformer l'un de ces imports en
 * import de valeur : cela romprait cette absence de cycle réel. Alternative
 * écartée : dupliquer les 7 interfaces directement ici (dérive garantie entre
 * les deux copies au fil du temps, sans aucun bénéfice d'isolation puisque le
 * cycle type-only est déjà sans coût réel).
 */
export interface ProfileContext {
  readonly profileId: string;
  readonly profile?: ProfileData;
  readonly gitActivity?: GitActivityData;
  readonly pullRequests?: PullRequestsData;
  readonly sonarMeasures?: SonarData;
  readonly repoContext?: RepoContextData;
  readonly declaratif?: DeclaratifData;
  readonly session?: SessionDigest;
  readonly warnings: readonly ProfileWarning[];
}

/**
 * Contrat que doit respecter tout fichier sous `src/checks/**` (un fichier par
 * `<marche>.<source>.ts`, regroupé dans l'un des 5 tableaux de
 * `src/packs.ts`). Un check ne connaît que `ProfileContext` et le `Referentiel`
 * chargé — jamais de seuil littéral (`thresholdFor(referentiel, path_id)` dans
 * `run`, jamais un nombre en dur — `.claude/rules/fiabilite.md`).
 *
 * `core/registry.ts` isole chaque exécution (`runCheck`) : une exception levée par
 * `run`, ou un check `enabled: false`, ne produit jamais d'Evidence — seulement
 * `{unknown: true, warning}` — et ne fait jamais tomber les autres checks du même
 * pack.
 */
export interface Check {
  /** `check_id` stable, unique dans tout le registre (ex. `T2.git-activity`). */
  readonly id: string;
  readonly axe: AxeId;
  /** Marche couverte (ex. `T2`) — doit préfixer chaque entrée de `path_ids`. */
  readonly marche: string;
  /** Une ou plusieurs sources lues par ce check (`Evidence.source` reste mono-source). */
  readonly sources: readonly SourceId[];
  /** Nom du pack propriétaire (ex. `core-git-activity`) — doit correspondre au tableau de `src/packs.ts` qui le contient. */
  readonly pack: string;
  /** `false` ⇒ `runCheck` rend ses `path_ids` inconnus sans jamais exécuter `run`. */
  readonly enabled: boolean;
  /** `path_id` du référentiel que ce check déclare couvrir ; chacun doit exister dans `referentiel.thresholds`. */
  readonly path_ids: readonly string[];
  readonly run: (context: ProfileContext, referentiel: Referentiel) => readonly Evidence[];
}
