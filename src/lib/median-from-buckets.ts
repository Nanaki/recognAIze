/**
 * Médiane d'une distribution de taille exprimée en 5 classes ordonnées
 * (`xs ≤ s ≤ m ≤ l ≤ xl`) plutôt qu'en valeurs individuelles — la forme exacte de
 * `git-activity.json`.`pull_requests.size_distribution` (voir `sources/git-activity.ts`,
 * `GitActivitySizeDistribution`). Fonction pure, table-driven, aucune E/S —
 * consommée par les checks `T2`/`T3`.
 *
 * Définition retenue (généralise la définition usuelle de la médiane à des
 * classes plutôt qu'à des valeurs) : pour `n` éléments répartis dans les 5
 * classes, les positions médianes (1-indexées) sont `⌈n/2⌉` et `⌊n/2⌋+1` — pour
 * `n` impair ces deux positions coïncident (une seule classe « vraie médiane ») ;
 * pour `n` pair elles peuvent tomber dans deux classes ADJACENTES distinctes
 * (partage exactement à 50/50) — la classe retenue est alors la plus BASSE des
 * deux (règle conservatrice : « ex æquo → classe inférieure », jamais un
 * arrondi optimiste vers le haut).
 *
 * `total`, s'il est fourni, DOIT être égal à la somme des 5 classes — une
 * incohérence (`sum(buckets) ≠ total`, ex. `size_distribution` partiel alors que
 * `pull_requests.total` compte plus de PR) rend le résultat inconnu plutôt que de
 * calculer une médiane sur des données silencieusement tronquées (`testing.md` :
 * « somme ≠ total » est un cas de test explicite).
 */

export type SizeClass = "xs" | "s" | "m" | "l" | "xl";

/** Mêmes 5 clés, toutes optionnelles, que `GitActivitySizeDistribution` (`sources/git-activity.ts`). */
export interface SizeBuckets {
  readonly xs?: number;
  readonly s?: number;
  readonly m?: number;
  readonly l?: number;
  readonly xl?: number;
}

export type MedianFromBucketsResult =
  | SizeClass
  | { readonly status: "unknown"; readonly reason: string };

/** Ordre croissant des 5 classes — jamais `Intl`/tri par nom, ordre métier figé. */
const CLASS_ORDER: readonly SizeClass[] = ["xs", "s", "m", "l", "xl"];

/** Garde de type : distingue une classe (`string`) d'un résultat inconnu (`object`). */
export function isMedianUnknown(
  result: MedianFromBucketsResult,
): result is { readonly status: "unknown"; readonly reason: string } {
  return typeof result === "object";
}

/** Index (0..4) de la classe contenant le `position`-ième élément (1-indexé), par cumul croissant. */
function classIndexOfPosition(counts: readonly number[], position: number): number {
  let cumulative = 0;
  for (let index = 0; index < counts.length; index += 1) {
    cumulative += counts[index] ?? 0;
    if (cumulative >= position) {
      return index;
    }
  }
  return counts.length - 1;
}

/**
 * Médiane par classes. Ne lève jamais (`.claude/rules/fiabilite.md`) : toute
 * entrée dégénérée (histogramme vide, effectif négatif ou non fini, somme
 * incohérente avec `total`) rend `{status:"unknown", reason}` plutôt qu'un
 * résultat inventé.
 */
export function medianFromBuckets(buckets: SizeBuckets, total?: number): MedianFromBucketsResult {
  const counts = CLASS_ORDER.map((cls) => buckets[cls] ?? 0);

  if (counts.some((count) => !Number.isFinite(count) || count < 0)) {
    return { status: "unknown", reason: "histogramme invalide : au moins une classe négative ou non finie" };
  }

  const sum = counts.reduce((acc, count) => acc + count, 0);

  if (total !== undefined && total !== sum) {
    return {
      status: "unknown",
      reason: `somme des classes (${sum}) ≠ total déclaré (${total})`,
    };
  }

  if (sum <= 0) {
    return { status: "unknown", reason: "histogramme vide (aucun effectif dans les 5 classes)" };
  }

  const lowerPosition = Math.ceil(sum / 2); // anti-littéral-lib: formule mathématique de la position médiane (histogramme), pas un seuil métier consommé par un check.
  const upperPosition = Math.floor(sum / 2) + 1; // anti-littéral-lib: même formule de position médiane que ci-dessus.

  const lowerIndex = classIndexOfPosition(counts, lowerPosition);
  const upperIndex = classIndexOfPosition(counts, upperPosition);

  // Ex æquo (les deux positions médianes tombent dans des classes distinctes,
  // nécessairement adjacentes) ⇒ classe inférieure, jamais un arrondi optimiste.
  const resolvedIndex = Math.min(lowerIndex, upperIndex);
  return CLASS_ORDER[resolvedIndex] as SizeClass;
}
