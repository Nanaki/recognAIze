/**
 * Juge générique : transforme des `Evidence[]` en niveaux par axe, rang(s),
 * fourchette et confiance — sans jamais connaître un check réel. Toute la
 * mécanique ci-dessous est prouvée par `test/judge.unit.test.ts` avec des
 * `Evidence` synthétiques.
 *
 * Vocabulaire et règles verrouillées consommées ici :
 * - 6 états et leur priorité (`Etat`, `core/types.ts`) : « compris » n'est
 *   jamais produit par ce module (réservé à l'entretien, hors périmètre).
 * - `.claude/rules/fiabilite.md` : jamais de rang sans fourchette ni confiance ;
 *   dénominateur nul ⇒ confiance 0 explicite, jamais `NaN`.
 * - Monotonie : le déclaratif (`DEC`) n'a aucun poids dans la montée de rang,
 *   ni en positif ni en négatif.
 * - Fidélité à la grille officielle et DEC-003 (Ownership).
 *
 * `Evidence` (`core/types.ts`) n'a pas de champ `marche` explicite : ce module
 * dérive systématiquement la marche d'un `path_id` par son préfixe avant le
 * premier point (`"T2.p1"` → `"T2"`) — cohérent avec
 * `validatePathIdsPrefixedByOwningMarche` de `core/referentiel.ts`. Une preuve
 * de contre-preuve (`counter_proof`, qui n'a pas son propre `path_id` dans
 * `referentiel.json`) est donc attendue avec le `path_id` de n'importe quel
 * `proof_path` de la même marche — seul le préfixe compte ici.
 */

import type { Referentiel } from "./referentiel.js";
import {
  RANGS_ORDONNES,
  type AxeId,
  type Confiance,
  type Etat,
  type EtatMarche,
  type Evidence,
  type Fourchette,
  type Rang,
  type SourceId,
  type Verdict,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Les 4 axes officiels de la ligne de montée — Ownership (`O`) en est exclu. */
const OFFICIAL_AXES: readonly AxeId[] = ["T", "H", "I", "P"];

// Précédence des sources en cas de contradiction sur une même marche : vit
// dans `referentiel.json`.`source_precedence` (voir sa docstring dans
// `core/referentiel.ts` et `docs/referentiel.md` § Précédence des sources
// pour la justification complète, dont le placement délibéré de `SU` sous
// `GA`/`PR`/`S`) — jamais un littéral ici. `report/explain.ts` lit le même
// champ.

/**
 * Rang correspondant à chaque marche Ownership, par index (`O1`→`red`,
 * `O2`→`blue`, …, `O5`→`silver`). Ownership n'a pas de correspondance déclarée
 * avec `Rang` dans `referentiel.json` puisqu'il est hors ligne de montée : ce
 * mapping applique un décalage +1 sur `RANGS_ORDONNES` (`white` n'a pas
 * d'équivalent Ownership, `gold` non plus — 5 marches Ownership pour 6 rangs
 * non-`white`).
 */
const OWNERSHIP_RANG_BY_INDEX: readonly Rang[] = ["red", "blue", "green", "copper", "silver"];

/** Clés de `referentiel.ladder`, dans l'ordre de progression (`white` n'y figure jamais — c'est l'absence de rang). */
const RANK_ORDER: readonly (keyof Referentiel["ladder"])[] = ["red", "blue", "green", "copper", "silver", "gold"];

// ---------------------------------------------------------------------------
// Types d'entrée / sortie
// ---------------------------------------------------------------------------

/**
 * Entrée du juge :
 * - `hasAiUsageProof` : booléen indiquant si une preuve d'usage de l'IA a été
 *   détectée, testé comme une vraie branche du juge.
 * - `referenceSourcesPresentes` : quelles sources (`GA`, `RC`, …) étaient
 *   présentes dans le profil analysé, indépendamment de toute `Evidence`
 *   produite — nécessaire pour distinguer « source présente et muette »
 *   (contre-preuve) de « source absente » (inconnu). Peuplée depuis
 *   `ProfileContext` (ex. `gitActivity !== undefined` ⇒ `"GA"` présent).
 *   Absente par défaut ⇒ aucune source considérée présente (posture prudente :
 *   jamais de contre-preuve implicite sans confirmation explicite que la
 *   source a été regardée).
 */
export interface JudgeInput {
  readonly referentiel: Referentiel;
  readonly evidence: readonly Evidence[];
  readonly hasAiUsageProof: boolean;
  readonly referenceSourcesPresentes?: ReadonlySet<SourceId>;
}

/** Verdict détaillé d'un axe officiel (T, H, I ou P). */
export interface AxisJudgement {
  readonly axe: AxeId;
  readonly niveau_prouve: string | null;
  readonly niveau_ponctuel: string | null;
  /** Plafond optimiste (« si les inconnues étaient prouvées »), plafonné par toute marche infirmée. */
  readonly plafond_potentiel: string | null;
  readonly etats: readonly EtatMarche[];
  /** Facteur de couverture : part des `path_id` observables déjà dotés d'`Evidence`, dans [0 ; 1] arrondi à 2 décimales. */
  readonly couverture: number;
  /** Facteur d'accord : 1 moins la part de marches de l'axe qui ne sont pas nettement « prouvé » (dénominateur structurel, jamais affecté par le retrait d'`Evidence`), dans [0 ; 1] arrondi à 2 décimales. */
  readonly accord: number;
  readonly confiance: Confiance;
  /** `false` ⇒ axe « non observé » (aucun chemin de preuve n'a de source dans la fenêtre considérée). */
  readonly observe: boolean;
}

/** Ownership : affiché, hors ligne de montée (DEC-003). */
export interface OwnershipJudgement {
  readonly niveau_prouve: string | null;
  readonly niveau_ponctuel: string | null;
  readonly etats: readonly EtatMarche[];
  readonly rabais_applique: boolean;
  readonly mention?: string;
}

export interface JudgeResult {
  /** `"indeterminate"` ⇔ aucune preuve d'usage de l'IA : fourchette White–Gold, confiance 0. */
  readonly status: "ok" | "indeterminate";
  readonly rang_prouve: Rang | null;
  readonly rang_ponctuel: Rang | null;
  /** Rang affiché : `rang_ponctuel`, éventuellement abaissé d'un cran par Ownership (DEC-003). */
  readonly rang_affiche: Rang | null;
  readonly fourchette: Fourchette;
  /** Minimum des 4 axes officiels — Ownership exclu. */
  readonly confiance_globale: Confiance;
  readonly axes: readonly AxisJudgement[];
  readonly ownership: OwnershipJudgement;
  readonly verdicts: readonly Verdict[];
  /** Contradictions retenues entre sources, une ligne par marche en désaccord. */
  readonly incoherences: readonly string[];
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Résolution d'état par marche
// ---------------------------------------------------------------------------

/**
 * État porté par une seule source pour une marche donnée. `DEC` ne produit
 * jamais `infirmé` ni `prouvé` : quelle que soit sa polarité ou sa force, une
 * preuve `DEC` reste `déclaré` — c'est la traduction littérale de « le
 * déclaratif n'a aucun poids dans la montée de rang » (Monotonie) : sans ce
 * garde-fou, une contre-preuve `DEC` isolée (`confiance_source: 0`) pourrait à
 * elle seule infirmer une marche, ce qui contredirait la règle.
 *
 * Une contre-preuve n'infirme une marche que si AU MOINS UNE de ses
 * `Evidence` porte `force: "prouve"` — une contre-preuve `"indice"` seule
 * (sans corroboration `"prouve"`, positive ou négative) résout à `"indice"`,
 * jamais `"infirmé"`. `force` est un attribut STRUCTUREL du `proof_path`
 * déclaré par `referentiel.json` (jamais choisi par le check à l'exécution,
 * voir `ProofPathInfo`/`buildEvidence`, `src/lib/threshold-eval.ts`) — ex.
 * `T2.p3` (source `S`, session) est `force: "indice"` par construction, quand
 * `T2.p1` (source `GA`) est `force: "prouve"`. Une contre-preuve `"indice"`
 * seule reste NÉANMOINS un signal réel (plus informatif qu'un pur inconnu,
 * moins qu'une preuve) : elle résout à `"indice"`, jamais à `"prouvé"` (elle
 * ne PROUVE toujours rien) ni `"inconnu"` (elle n'est pas absente). Voir aussi
 * le facteur « accord » de `computeAxisConfidence` : cette règle et ce
 * facteur sont nécessaires et indépendants (`plafond`/fourchette vs
 * `confiance`).
 */
function sourceEtat(source: SourceId, evidences: readonly Evidence[]): Etat {
  if (source === "DEC") return "déclaré";
  const hasStrongContrePreuve = evidences.some(
    (evidence) => evidence.polarite === "contre-preuve" && evidence.force === "prouve",
  );
  if (hasStrongContrePreuve) return "infirmé";
  if (evidences.some((evidence) => evidence.force === "prouve")) return "prouvé";
  return "indice";
}

interface ContradictionResolue {
  readonly sources: readonly SourceId[];
  readonly retenue: SourceId;
}

interface EtatResolu {
  readonly etat: Etat;
  readonly contradiction?: ContradictionResolue;
}

/**
 * Ordonne les sources d'une contradiction par `sourcePrecedence`
 * (`referentiel.json`.`source_precedence`) plutôt que par ordre d'apparition
 * dans l'`Evidence` d'entrée : `etatBySource` est un `Map`, dont l'ordre
 * d'itération suit l'ordre de PREMIÈRE apparition de chaque source dans le
 * tableau `evidence` reçu par {@link resolveMarcheEtat} — donc dépendant de
 * l'ordre d'entrée. `JudgeResult.incoherences` doit rester indépendant de cet
 * ordre (docstring de tête de fichier) : seul l'ordre d'affichage de la liste
 * `sources` est concerné ici, le contenu de la contradiction (quelle source
 * « gagne », `retenue`) est déjà indépendant de l'ordre.
 */
function orderedContradictionSources(etatBySource: ReadonlyMap<SourceId, Etat>, sourcePrecedence: readonly SourceId[]): readonly SourceId[] {
  return sourcePrecedence.filter((source) => etatBySource.has(source));
}

/**
 * Résout l'état d'une marche à partir de toute son `Evidence`. Rétrocède
 * d'abord par source (priorité d'état, appliquée dans {@link sourceEtat} pour
 * une source donnée) puis, si plusieurs sources sont en désaccord, par
 * précédence de source — la contradiction est alors rapportée pour le caller
 * (« Incohérences ») et pour le facteur d'accord.
 */
function resolveMarcheEtat(evidences: readonly Evidence[], sourcePrecedence: readonly SourceId[]): EtatResolu {
  if (evidences.length === 0) return { etat: "inconnu" };

  const bySource = new Map<SourceId, Evidence[]>();
  for (const evidence of evidences) {
    const list = bySource.get(evidence.source) ?? [];
    list.push(evidence);
    bySource.set(evidence.source, list);
  }

  const etatBySource = new Map<SourceId, Etat>();
  for (const [source, list] of bySource) {
    etatBySource.set(source, sourceEtat(source, list));
  }

  const distinctEtats = new Set(etatBySource.values());
  if (distinctEtats.size <= 1) {
    const [uniqueEtat] = [...distinctEtats];
    return { etat: uniqueEtat ?? "inconnu" };
  }

  for (const source of sourcePrecedence) {
    const etat = etatBySource.get(source);
    if (etat !== undefined) {
      return { etat, contradiction: { sources: orderedContradictionSources(etatBySource, sourcePrecedence), retenue: source } };
    }
  }
  // Ne devrait jamais arriver : sourcePrecedence couvre tous les SourceId (validé au chargement du référentiel) — filet de sécurité.
  const [fallbackSource] = etatBySource.keys();
  const fallbackEtat = fallbackSource !== undefined ? etatBySource.get(fallbackSource) : undefined;
  return {
    etat: fallbackEtat ?? "inconnu",
    contradiction: fallbackSource !== undefined ? { sources: orderedContradictionSources(etatBySource, sourcePrecedence), retenue: fallbackSource } : undefined,
  };
}

/** Marche d'un `path_id` : préfixe avant le premier point (`"T2.p1"` → `"T2"`). */
function marcheIdOf(pathId: string): string {
  const dotIndex = pathId.indexOf(".");
  return dotIndex === -1 ? pathId : pathId.slice(0, dotIndex);
}

// ---------------------------------------------------------------------------
// Niveaux par axe (prouvé / ponctuel / plafond)
// ---------------------------------------------------------------------------

interface MarcheInfo {
  readonly id: string;
  readonly index: number;
  readonly isDefault: boolean;
  readonly proofPathIds: readonly string[];
}

function marchesOf(axis: Referentiel["axes"][number]): MarcheInfo[] {
  return axis.marches.map((marche, index) => ({
    id: marche.id,
    index,
    isDefault: marche.default,
    proofPathIds: marche.proof_paths.map((proofPath) => proofPath.path_id),
  }));
}

/** Plus haut index atteignable dans `allowed`, sans qu'aucune marche « infirmé » ne se trouve à un index strictement inférieur (jamais au-delà d'une marche infirmée). */
function highestReachIndex(etats: readonly Etat[], allowed: readonly Etat[]): number {
  let best = -1;
  for (let index = 0; index < etats.length; index += 1) {
    if (!allowed.includes(etats[index] as Etat)) continue;
    let blockedByInfirme = false;
    for (let below = 0; below < index; below += 1) {
      if (etats[below] === "infirmé") {
        blockedByInfirme = true;
        break;
      }
    }
    if (!blockedByInfirme) best = Math.max(best, index);
  }
  return best;
}

/** Plus haut index consécutif depuis 0 (sans interpolation) — utilisé uniquement pour la frontière de la règle « source muette ». */
function lastContiguousIndex(etats: readonly Etat[]): number {
  let last = -1;
  for (const etat of etats) {
    if (etat === "prouvé" || etat === "indice") {
      last += 1;
    } else {
      break;
    }
  }
  return last;
}

/** Plafond optimiste : étend depuis `niveauPonctuelIndex` tant qu'aucune marche « infirmé » n'est rencontrée (fourchette plafonnée par les infirmées). */
function computePlafondIndex(etats: readonly Etat[], niveauPonctuelIndex: number): number {
  let top = niveauPonctuelIndex;
  for (let index = niveauPonctuelIndex + 1; index < etats.length; index += 1) {
    if (etats[index] === "infirmé") break;
    top = index;
  }
  return top;
}

interface AxisComputation {
  readonly marches: readonly MarcheInfo[];
  readonly etats: Etat[];
  /** Une ligne par contradiction retenue (pour `JudgeResult.incoherences`). */
  readonly contradictionLines: readonly string[];
  /** Une ligne par avertissement « données incohérentes » (preuve isolée au-dessus d'une marche infirmée). */
  readonly incoherenceWarnings: readonly string[];
  readonly niveauProuveIndex: number;
  readonly niveauPonctuelIndex: number;
  readonly plafondIndex: number;
}

/**
 * Calcule tout le nécessaire pour un axe (officiel ou Ownership) à partir de
 * son `Evidence`. `applyDefaultSeed` : la première marche (T1/H1/I1/P1/O1) est
 * prouvée par défaut dès `hasAiUsageProof` — pour les 4 axes officiels,
 * systématique ; pour Ownership, conditionné en plus par la présence d'au
 * moins une source de référence de l'axe (DEC-003 : un rabais Ownership ne
 * doit jamais s'appliquer sur un profil où Ownership n'a même pas été
 * regardé).
 */
function computeAxis(
  axis: Referentiel["axes"][number],
  evidence: readonly Evidence[],
  hasAiUsageProof: boolean,
  referenceSourcesPresentes: ReadonlySet<SourceId>,
  applyDefaultSeed: boolean,
  sourcePrecedence: readonly SourceId[],
): AxisComputation {
  const marches = marchesOf(axis);

  const evidenceByMarche = new Map<string, Evidence[]>();
  for (const item of evidence) {
    if (item.axe !== axis.id) continue;
    const marcheId = marcheIdOf(item.path_id);
    const list = evidenceByMarche.get(marcheId) ?? [];
    list.push(item);
    evidenceByMarche.set(marcheId, list);
  }

  const etats: Etat[] = [];
  const contradictionLines: string[] = [];

  for (const marche of marches) {
    const marcheEvidence = evidenceByMarche.get(marche.id) ?? [];
    const resolved = resolveMarcheEtat(marcheEvidence, sourcePrecedence);
    let etat = resolved.etat;
    if (marche.isDefault && applyDefaultSeed && hasAiUsageProof) {
      etat = "prouvé";
    }
    etats.push(etat);

    if (resolved.contradiction) {
      // Chaîne de précédence dérivée de `sourcePrecedence` — jamais un littéral figé ici, pour
      // rester en accord avec la précédence réelle (source_precedence, y compris `SU`).
      contradictionLines.push(
        `${marche.id} : sources en désaccord (${resolved.contradiction.sources.join(", ")}) — "${resolved.contradiction.retenue}" retenue (précédence ${sourcePrecedence.join(" > ")}).`,
      );
    }
  }

  // Source de référence présente et axe entièrement muet ⇒ contre-preuve à la
  // frontière (la première marche encore « inconnu » juste après le dernier
  // niveau connu). Un seul rung suffit : la règle « jamais au-delà d'une marche
  // infirmée » (cf. highestReachIndex/computePlafondIndex) plafonne déjà tout
  // ce qui suit — inutile de marquer les marches plus hautes.
  const axisHasAnyEvidence = evidence.some((item) => item.axe === axis.id);
  const referencePresent = axis.reference_source.some((source) => referenceSourcesPresentes.has(source));
  if (referencePresent && !axisHasAnyEvidence) {
    const boundary = lastContiguousIndex(etats) + 1;
    if (boundary < etats.length && etats[boundary] === "inconnu") {
      etats[boundary] = "infirmé";
    }
  }

  const niveauProuveIndex = highestReachIndex(etats, ["prouvé"]);
  const niveauPonctuelIndex = highestReachIndex(etats, ["prouvé", "indice"]);
  const plafondIndex = computePlafondIndex(etats, niveauPonctuelIndex);

  const incoherenceWarnings: string[] = [];
  for (let infirmeIndex = 0; infirmeIndex < etats.length; infirmeIndex += 1) {
    if (etats[infirmeIndex] !== "infirmé") continue;
    for (let above = infirmeIndex + 1; above < etats.length; above += 1) {
      const etatAbove = etats[above];
      if (etatAbove === "prouvé" || etatAbove === "indice") {
        const plafondMarcheId = niveauPonctuelIndex >= 0 ? (marches[niveauPonctuelIndex]?.id ?? "aucun") : "aucun";
        incoherenceWarnings.push(
          `Données incohérentes sur l'axe ${axis.id} : ${marches[above]?.id ?? above} montre une preuve isolée (${etatAbove}) au-dessus de ${marches[infirmeIndex]?.id ?? infirmeIndex} (infirmée) — niveau plafonné à ${plafondMarcheId}.`,
        );
      }
    }
  }

  return {
    marches,
    etats,
    contradictionLines,
    incoherenceWarnings,
    niveauProuveIndex,
    niveauPonctuelIndex,
    plafondIndex,
  };
}

// ---------------------------------------------------------------------------
// Confiance par axe
// ---------------------------------------------------------------------------

/** Arrondi à 2 décimales, borné à [0 ; 1] ; `NaN`/`Infinity` ⇒ 0 explicite (jamais silencieux — `.claude/rules/fiabilite.md`). */
function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 100) / 100;
}

interface AxisConfidence {
  readonly coverage: number;
  readonly agreement: number;
  readonly confiance: Confiance;
  readonly observe: boolean;
}

/**
 * Couverture × accord. Couverture = part des `path_id` des marches ≤
 * `niveauPonctuelIndex + 1` qui ont au moins une `Evidence` (peu importe sa
 * polarité — « aren't simply absent of any attempt »).
 *
 * Accord = 1 − (marches « non prouvées » / TOTAL des marches de l'axe), où le
 * DÉNOMINATEUR est une CONSTANTE STRUCTURELLE (`etats.length`, dérivée
 * uniquement de `referentiel.json` — le nombre de marches de l'axe — jamais
 * de l'`Evidence` reçue) et le NUMÉRATEUR compte toute marche dont l'état
 * résolu N'EST PAS `"prouvé"` (`indice`, `infirmé`, `déclaré` ET `inconnu`
 * comptent tous comme « non prouvée » — le déclaratif n'ayant « aucun poids »
 * pour la MONTÉE de rang, pas qu'il vaille preuve pour la CONFIANCE). Ce choix
 * garantit la monotonie sous retrait d'`Evidence` : retirer de l'`Evidence` ne
 * peut jamais faire d'une marche RÉSOLUE-AUTREMENT une marche `"prouvé"` (cf.
 * `sourceEtat`), et le dénominateur ne varie jamais — le compte des marches
 * « non prouvées » est donc monotone NON-DÉCROISSANT sous retrait, l'accord
 * (`1 − ce ratio`) monotone NON-CROISSANT.
 *
 * Toute formule dont le dénominateur dépend de l'`Evidence` présente (ex.
 * « marches à sources multiples », ou « marches non-`inconnu` ») casse cette
 * garantie : retirer une marche du numérateur ET du dénominateur EN MÊME
 * TEMPS peut faire baisser le ratio de contestation, donc MONTER l'accord
 * affiché en retirant une preuve, même quand la preuve retirée n'a rien réglé
 * — pour `k` contradictions sur `m` marches à sources multiples (`k ≤ m`),
 * retirer une marche contestée fait passer le taux de `k/m` à `(k−1)/(m−1)`,
 * et `(k−1)/(m−1) − k/m = (k−m)/(m(m−1)) ≤ 0`.
 *
 * Portée : cette garantie de monotonie ne couvre pas le cas théorique où un
 * masquage de précédence est RÉVÉLÉ par ablation (une source de haute
 * précédence mais faible état masquant une source de précédence plus faible
 * mais `"prouvé"`) — non observé sur les étalons réels ni leurs ablations
 * (`evals/ablation.ts`), hors du périmètre couvert par
 * `test/judge.properties.test.ts` (`monotonicScenarioArb`, un seul `source`
 * canonique par marche).
 */
function computeAxisConfidence(
  marches: readonly MarcheInfo[],
  evidence: readonly Evidence[],
  axeId: AxeId,
  niveauPonctuelIndex: number,
  etats: readonly Etat[],
): AxisConfidence {
  const windowEnd = Math.min(marches.length - 1, Math.max(niveauPonctuelIndex + 1, 0));
  const pathIdsWithEvidence = new Set(evidence.filter((item) => item.axe === axeId).map((item) => item.path_id));

  let totalPathIds = 0;
  let coveredPathIds = 0;
  for (let index = 0; index <= windowEnd; index += 1) {
    for (const pathId of marches[index]?.proofPathIds ?? []) {
      totalPathIds += 1;
      if (pathIdsWithEvidence.has(pathId)) coveredPathIds += 1;
    }
  }

  const coverage = totalPathIds === 0 ? 0 : round2(coveredPathIds / totalPathIds);

  const totalMarches = etats.length;
  const notProuveMarches = etats.reduce((count, etat) => (etat === "prouvé" ? count : count + 1), 0);
  const agreement = totalMarches === 0 ? 1 : round2(1 - notProuveMarches / totalMarches);

  const confiance = round2(coverage * agreement);
  const observe = coveredPathIds > 0;

  return { coverage, agreement, confiance, observe };
}

// ---------------------------------------------------------------------------
// Ligne de montée : des index de marche par axe à un Rang
// ---------------------------------------------------------------------------

/**
 * Rang atteint en parcourant `RANK_ORDER` dans l'ordre : un rang n'est retenu
 * que si toutes ses marches (`referentiel.ladder[rang]`) sont à un index ≤ le
 * niveau atteint (`reachIndexByAxis`) de leur propre axe — « un rang n'est
 * atteint que si toutes ses marches sont prouvées » (spec, « Fidélité à la
 * grille officielle »). La cumulativité (atteindre `green` suppose `red` et
 * `blue`) découle naturellement de l'interpolation de {@link highestReachIndex} :
 * une marche haute directement prouvée « couvre » par construction toute
 * marche de son propre axe strictement en dessous.
 */
function rangFromReach(
  referentiel: Referentiel,
  marchesByAxis: ReadonlyMap<AxeId, readonly MarcheInfo[]>,
  reachIndexByAxis: ReadonlyMap<AxeId, number>,
): Rang {
  let achieved: Rang = "white";
  for (const rank of RANK_ORDER) {
    const marcheIds = referentiel.ladder[rank];
    const allWithinReach = marcheIds.every((marcheId) => {
      for (const [axeId, marches] of marchesByAxis) {
        const found = marches.find((marche) => marche.id === marcheId);
        if (found) {
          const reach = reachIndexByAxis.get(axeId) ?? -1;
          return found.index <= reach;
        }
      }
      return false;
    });
    if (allWithinReach) {
      achieved = rank;
    } else {
      break;
    }
  }
  return achieved;
}

function shiftDown(rang: Rang): Rang {
  const index = RANGS_ORDONNES.indexOf(rang);
  return RANGS_ORDONNES[Math.max(0, index - 1)] as Rang;
}

function minRang(a: Rang, b: Rang): Rang {
  const indexA = RANGS_ORDONNES.indexOf(a);
  const indexB = RANGS_ORDONNES.indexOf(b);
  return indexA <= indexB ? a : b;
}

function maxRang(a: Rang, b: Rang): Rang {
  const indexA = RANGS_ORDONNES.indexOf(a);
  const indexB = RANGS_ORDONNES.indexOf(b);
  return indexA >= indexB ? a : b;
}

// ---------------------------------------------------------------------------
// Raison chiffrée (Verdict.raison)
// ---------------------------------------------------------------------------

/**
 * Verdict.raison provient de la `citation` de l'`Evidence` déterminante de la
 * marche bloquante quand elle existe (un check remplit `citation` avec la
 * valeur observée, le seuil et le sens de comparaison — ex.
 * « 46/154 = 0,30 < 0,8 », spec « Explicabilité ») ; sinon un texte générique
 * nommant la marche et son état.
 *
 * Le choix de LA citation retenue quand plusieurs `Evidence` de la marche
 * bloquante en portent une doit être indépendant de l'ordre du tableau
 * `evidence` reçu par `judge()` : trié par `sourcePrecedence`
 * (`referentiel.json`.`source_precedence`, la source la plus fiable d'abord),
 * puis par `id` d'`Evidence` à égalité de source, avant de prendre la
 * première citation non vide — jamais un `.find()` direct sur l'ordre
 * d'entrée, qui dépendrait silencieusement de cet ordre.
 */
function buildRaison(
  comp: AxisComputation,
  evidence: readonly Evidence[],
  blockingIndex: number,
  sourcePrecedence: readonly SourceId[],
): string {
  if (blockingIndex < 0) {
    const last = comp.marches[comp.marches.length - 1];
    return `Toutes les marches connues de l'axe sont atteintes (jusqu'à ${last?.id ?? "?"}).`;
  }
  const marche = comp.marches[blockingIndex];
  if (!marche) return "Marche bloquante introuvable.";
  const etat = comp.etats[blockingIndex] ?? "inconnu";
  const marcheEvidence = evidence.filter((item) => marcheIdOf(item.path_id) === marche.id);
  const bySourcePrecedenceThenId = [...marcheEvidence].sort((a, b) => {
    const precedenceDelta = sourcePrecedence.indexOf(a.source) - sourcePrecedence.indexOf(b.source);
    return precedenceDelta !== 0 ? precedenceDelta : a.id.localeCompare(b.id);
  });
  const withCitation = bySourcePrecedenceThenId.find((item) => item.citation !== undefined && item.citation.length > 0);
  if (withCitation?.citation !== undefined) {
    return `${marche.id} (${etat}) : ${withCitation.citation}`;
  }
  if (etat === "infirmé") return `${marche.id} : contre-preuve retenue — marche infirmée.`;
  if (etat === "déclaré") return `${marche.id} : seulement déclaré — sans poids pour la montée de rang.`;
  return `${marche.id} : aucune preuve disponible — marche inconnue.`;
}

// ---------------------------------------------------------------------------
// Statut indéterminé
// ---------------------------------------------------------------------------

/**
 * Aucune preuve d'usage de l'IA nulle part dans le profil ⇒ statut
 * `"indeterminate"`, fourchette White–Gold, confiance 0 (spec, « Honnêteté sur
 * l'incertitude ») — branche réelle et testée, jamais un rang inventé.
 */
function indeterminateResult(): JudgeResult {
  const emptyAxis = (axe: AxeId): AxisJudgement => ({
    axe,
    niveau_prouve: null,
    niveau_ponctuel: null,
    plafond_potentiel: null,
    etats: [],
    couverture: 0,
    accord: 0,
    confiance: 0,
    observe: false,
  });
  return {
    status: "indeterminate",
    rang_prouve: null,
    rang_ponctuel: null,
    rang_affiche: null,
    fourchette: { bas: "white", haut: "gold" },
    confiance_globale: 0,
    axes: OFFICIAL_AXES.map(emptyAxis),
    ownership: { niveau_prouve: null, niveau_ponctuel: null, etats: [], rabais_applique: false },
    verdicts: OFFICIAL_AXES.map((axe) => ({
      axe,
      niveau_prouve: null,
      niveau_ponctuel: null,
      raison: "Aucune preuve d'usage de l'IA détectée dans le profil : statut indéterminé.",
      etats: [],
    })),
    incoherences: [],
    warnings: [
      "Aucune preuve d'usage de l'IA détectée dans le profil : statut indéterminé (fourchette White–Gold, confiance 0).",
    ],
  };
}

// ---------------------------------------------------------------------------
// Juge — point d'entrée
// ---------------------------------------------------------------------------

/**
 * Transforme `Evidence[]` en verdicts, rang(s), fourchette et confiance. Ne
 * lève jamais (données dégénérées/vides ⇒ résultat bien formé, jamais un
 * crash — invariant (a) de `core/invariants.ts`, `.claude/rules/fiabilite.md`).
 */
export function judge(input: JudgeInput): JudgeResult {
  const { referentiel, evidence, hasAiUsageProof } = input;
  const referenceSourcesPresentes = input.referenceSourcesPresentes ?? new Set<SourceId>();

  if (!hasAiUsageProof) {
    return indeterminateResult();
  }

  const axisById = new Map(referentiel.axes.map((axis) => [axis.id, axis]));

  const officialComputations = new Map<AxeId, AxisComputation>();
  for (const axeId of OFFICIAL_AXES) {
    const axis = axisById.get(axeId);
    if (!axis) continue; // référentiel invalide n'atteindrait jamais ce point (loadReferentiel l'aurait rejeté) — filet de sécurité, jamais de crash.
    officialComputations.set(axeId, computeAxis(axis, evidence, hasAiUsageProof, referenceSourcesPresentes, true, referentiel.source_precedence));
  }

  const marchesByAxis = new Map<AxeId, readonly MarcheInfo[]>();
  const prouveReach = new Map<AxeId, number>();
  const ponctuelReach = new Map<AxeId, number>();
  const plafondReach = new Map<AxeId, number>();
  for (const [axeId, comp] of officialComputations) {
    marchesByAxis.set(axeId, comp.marches);
    prouveReach.set(axeId, comp.niveauProuveIndex);
    ponctuelReach.set(axeId, comp.niveauPonctuelIndex);
    plafondReach.set(axeId, comp.plafondIndex);
  }

  const rangProuve = rangFromReach(referentiel, marchesByAxis, prouveReach);
  const rangPonctuel = rangFromReach(referentiel, marchesByAxis, ponctuelReach);
  const rangHaut = rangFromReach(referentiel, marchesByAxis, plafondReach);

  const axes: AxisJudgement[] = OFFICIAL_AXES.map((axeId) => {
    const comp = officialComputations.get(axeId);
    if (!comp) {
      return {
        axe: axeId,
        niveau_prouve: null,
        niveau_ponctuel: null,
        plafond_potentiel: null,
        etats: [],
        couverture: 0,
        accord: 0,
        confiance: 0,
        observe: false,
      };
    }
    const confidence = computeAxisConfidence(comp.marches, evidence, axeId, comp.niveauPonctuelIndex, comp.etats);
    return {
      axe: axeId,
      niveau_prouve: comp.niveauProuveIndex >= 0 ? (comp.marches[comp.niveauProuveIndex]?.id ?? null) : null,
      niveau_ponctuel: comp.niveauPonctuelIndex >= 0 ? (comp.marches[comp.niveauPonctuelIndex]?.id ?? null) : null,
      plafond_potentiel: comp.plafondIndex >= 0 ? (comp.marches[comp.plafondIndex]?.id ?? null) : null,
      etats: comp.marches.map((marche, index) => ({ marche: marche.id, etat: comp.etats[index] ?? "inconnu" })),
      couverture: confidence.coverage,
      accord: confidence.agreement,
      confiance: confidence.confiance,
      observe: confidence.observe,
    };
  });

  const confianceGlobale = round2(Math.min(...axes.map((axisResult) => axisResult.confiance)));

  const verdicts: Verdict[] = OFFICIAL_AXES.map((axeId, position) => {
    const axisResult = axes[position];
    const comp = officialComputations.get(axeId);
    if (!axisResult || !comp) {
      return { axe: axeId, niveau_prouve: null, niveau_ponctuel: null, raison: "Axe indisponible.", etats: [] };
    }
    const blockingIndex = comp.niveauPonctuelIndex + 1 < comp.marches.length ? comp.niveauPonctuelIndex + 1 : -1;
    const marcheBloquante = blockingIndex >= 0 ? comp.marches[blockingIndex]?.id : undefined;
    return {
      axe: axeId,
      niveau_prouve: axisResult.niveau_prouve,
      niveau_ponctuel: axisResult.niveau_ponctuel,
      marche_bloquante: marcheBloquante,
      raison: buildRaison(comp, evidence, blockingIndex, referentiel.source_precedence),
      etats: axisResult.etats,
    };
  });

  // Ownership (DEC-003) — hors ligne de montée, affiché, rabais d'au plus un cran.
  const axisO = axisById.get("O");
  const warnings: string[] = [];
  const incoherences: string[] = [];
  for (const comp of officialComputations.values()) {
    warnings.push(...comp.incoherenceWarnings);
    incoherences.push(...comp.contradictionLines);
  }

  let rangAffiche: Rang = rangPonctuel;
  let fourchetteAffichee: Fourchette = { bas: rangProuve, haut: rangHaut };
  let rabaisApplique = false;
  let mention: string | undefined;
  let ownership: OwnershipJudgement = { niveau_prouve: null, niveau_ponctuel: null, etats: [], rabais_applique: false };

  if (axisO) {
    const ownershipReferencePresent = axisO.reference_source.some((source) => referenceSourcesPresentes.has(source));
    const ownershipComputation = computeAxis(
      axisO,
      evidence,
      hasAiUsageProof,
      referenceSourcesPresentes,
      ownershipReferencePresent,
      referentiel.source_precedence,
    );
    warnings.push(...ownershipComputation.incoherenceWarnings);
    incoherences.push(...ownershipComputation.contradictionLines);

    ownership = {
      niveau_prouve:
        ownershipComputation.niveauProuveIndex >= 0
          ? (ownershipComputation.marches[ownershipComputation.niveauProuveIndex]?.id ?? null)
          : null,
      niveau_ponctuel:
        ownershipComputation.niveauPonctuelIndex >= 0
          ? (ownershipComputation.marches[ownershipComputation.niveauPonctuelIndex]?.id ?? null)
          : null,
      etats: ownershipComputation.marches.map((marche, index) => ({
        marche: marche.id,
        etat: ownershipComputation.etats[index] ?? "inconnu",
      })),
      rabais_applique: false,
    };

    // DEC-003 : seul le niveau PROUVÉ (jamais l'indice seul, voir highestReachIndex(["prouvé"])
    // dans niveauProuveIndex) compte comme « connu » pour le rabais.
    const ownershipNiveauProuveConnu = ownershipComputation.niveauProuveIndex >= 0;
    if (ownershipNiveauProuveConnu) {
      const ownershipRang = OWNERSHIP_RANG_BY_INDEX[ownershipComputation.niveauProuveIndex] as Rang;
      const officialIndex = RANGS_ORDONNES.indexOf(rangPonctuel);
      const ownershipIndex = RANGS_ORDONNES.indexOf(ownershipRang);
      // `fourchette.haut` (« si les inconnues étaient prouvées ») se plafonne
      // sur le niveau Ownership PLAFOND OPTIMISTE
      // (`ownershipComputation.plafondIndex`), jamais sur le niveau PROUVÉ
      // (`ownershipRang`) : un rabais DEC-003 légitime (niveau prouvé
      // Ownership en retrait) ne doit pas, en plus, écraser la « bonne
      // nouvelle possible » du sommet de fourchette tant que les marches
      // Ownership au-dessus restent `indice` et non `infirmé`. Le rang affiché
      // et `fourchette.bas` restent pilotés par le niveau PROUVÉ
      // (conservateur) : seul le sommet de fourchette suit le plafond
      // optimiste.
      const ownershipPlafondRang: Rang | null =
        ownershipComputation.plafondIndex >= 0 ? (OWNERSHIP_RANG_BY_INDEX[ownershipComputation.plafondIndex] ?? null) : null;
      const ownershipHautCap = ownershipPlafondRang ?? ownershipRang;

      // Invariant : `fourchette.haut` ne descend JAMAIS sous `rang_ponctuel`
      // (le pire déjà acquis par les 4 axes officiels seuls, indépendamment de
      // l'opinion d'Ownership) — d'où le `maxRang` ci-dessous. Sans lui, un
      // `shiftDown(rangHaut)` inconditionnel pourrait passer strictement sous
      // `rang_ponctuel` quand le rabais Ownership déclenche un abaissement
      // alors que les 4 axes officiels n'offrent plus aucune marge optimiste
      // (`rangHaut === rangPonctuel`).
      if (referentiel.ownership.blocking) {
        if (ownershipIndex < officialIndex) {
          rangAffiche = ownershipRang;
          fourchetteAffichee = {
            bas: minRang(rangProuve, ownershipRang),
            haut: maxRang(minRang(rangHaut, ownershipHautCap), rangPonctuel),
          };
          rabaisApplique = true;
          mention = "Ownership bloquant (referentiel.ownership.blocking) : rang plafonné par Ownership.";
        }
      } else if (officialIndex - ownershipIndex >= 2) {
        rangAffiche = shiftDown(rangPonctuel);
        const ownershipHautCapIndex = RANGS_ORDONNES.indexOf(ownershipHautCap);
        const hautStillCapped = officialIndex - ownershipHautCapIndex >= 2;
        const proposedHaut = hautStillCapped ? shiftDown(rangHaut) : rangHaut;
        fourchetteAffichee = { bas: shiftDown(rangProuve), haut: maxRang(proposedHaut, rangPonctuel) };
        rabaisApplique = true;
        mention = "abaissé d'un cran : Ownership";
      }
    }

    ownership = { ...ownership, rabais_applique: rabaisApplique, mention };
  }

  if (mention !== undefined) {
    warnings.push(mention);
  }

  return {
    status: "ok",
    rang_prouve: rangProuve,
    rang_ponctuel: rangPonctuel,
    rang_affiche: rangAffiche,
    fourchette: fourchetteAffichee,
    confiance_globale: confianceGlobale,
    axes,
    ownership,
    verdicts,
    incoherences,
    warnings,
  };
}
