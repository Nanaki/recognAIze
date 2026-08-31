/**
 * Dérivation de la date de référence (`as_of`) et de la fenêtre d'analyse
 * associée. JAMAIS `Date.now()` (`.claude/rules/fiabilite.md`, règle ESLint
 * `no-restricted-properties` bannissant `Date.now(` sous `src/**`) : la
 * référence vient uniquement des données du profil ou d'un `--as-of` explicite
 * passé par l'appelant, jamais de l'heure d'exécution — condition nécessaire à
 * « même entrée → même `result.json` », indépendante de l'heure et du fuseau
 * horaire de la machine.
 *
 * Précédence :
 *   (a) `period` du profil (`git-activity.json`), bornes inclusives, UTC ;
 *   (b) sinon la `merged_at` la plus récente parmi les PR mergées — `as_of` =
 *       cette date, fenêtre = les 180 jours qui la précèdent ;
 *   (c) sinon `context_files.last_updated` (câblée depuis `repo-context/` ;
 *       ce module l'accepte en paramètre optionnel) — même fenêtre de 180
 *       jours ;
 *   (d) sinon `--as-of` explicite (CLI) — même fenêtre de 180 jours.
 * Aucune des quatre sources exploitable ⇒ `{status:"unknown", reason}`. Toute
 * date invalide, vide ou non finie rencontrée en cours de route est ignorée
 * (jamais propagée comme `NaN`/`Invalid Date`) : on retombe silencieusement sur
 * la source suivante dans l'ordre de précédence.
 */

const WINDOW_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Bornes inclusives, `"YYYY-MM-DD"` en UTC. */
export interface AsOfWindow {
  readonly from: string;
  readonly to: string;
}

export type AsOfSource = "period" | "merged_at" | "context_files" | "explicit";

export interface AsOfData {
  readonly asOf: string;
  readonly window: AsOfWindow;
  readonly source: AsOfSource;
}

export type AsOfResult =
  | { readonly status: "ok"; readonly data: AsOfData }
  | { readonly status: "unknown"; readonly reason: string };

export interface AsOfInput {
  /** `git-activity.json`.`period` — bornes brutes, non encore validées. */
  readonly period?: { readonly from?: unknown; readonly to?: unknown };
  /** `merged_at` bruts des PR MERGÉES uniquement — filtrage `merged:true` à la charge de l'appelant. */
  readonly mergedAts?: readonly unknown[];
  /** `repo-context/`.`context_files.last_updated`. */
  readonly contextFilesLastUpdated?: unknown;
  /** Valeur brute de `--as-of` passée par la CLI. */
  readonly explicitAsOf?: unknown;
}

/**
 * Timestamp UTC (ms) tronqué au jour, à partir d'une chaîne ISO (date seule ou
 * date-heure qualifiée). `undefined` pour toute entrée vide, non-chaîne, ou dont
 * le parsing produit une date non finie — jamais de `NaN` propagé plus loin.
 */
function toUtcDateOnlyMs(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return undefined;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const d = new Date(parsed);
  const dayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Number.isFinite(dayMs) ? dayMs : undefined;
}

function formatUtcDateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function windowFromAsOf(asOfMs: number): AsOfWindow {
  const fromMs = asOfMs - WINDOW_DAYS * MS_PER_DAY;
  return { from: formatUtcDateOnly(fromMs), to: formatUtcDateOnly(asOfMs) };
}

function tryPeriod(period: AsOfInput["period"]): AsOfData | undefined {
  if (period === undefined) {
    return undefined;
  }
  const fromMs = toUtcDateOnlyMs(period.from);
  const toMs = toUtcDateOnlyMs(period.to);
  if (fromMs === undefined || toMs === undefined || fromMs > toMs) {
    return undefined;
  }
  return {
    asOf: formatUtcDateOnly(toMs),
    window: { from: formatUtcDateOnly(fromMs), to: formatUtcDateOnly(toMs) },
    source: "period",
  };
}

function tryMergedAts(mergedAts: AsOfInput["mergedAts"]): AsOfData | undefined {
  if (mergedAts === undefined || mergedAts.length === 0) {
    return undefined;
  }
  let mostRecentMs: number | undefined;
  for (const raw of mergedAts) {
    const ms = toUtcDateOnlyMs(raw);
    if (ms === undefined) {
      continue;
    }
    if (mostRecentMs === undefined || ms > mostRecentMs) {
      mostRecentMs = ms;
    }
  }
  if (mostRecentMs === undefined) {
    return undefined;
  }
  return { asOf: formatUtcDateOnly(mostRecentMs), window: windowFromAsOf(mostRecentMs), source: "merged_at" };
}

function tryContextFiles(lastUpdated: unknown): AsOfData | undefined {
  const ms = toUtcDateOnlyMs(lastUpdated);
  if (ms === undefined) {
    return undefined;
  }
  return { asOf: formatUtcDateOnly(ms), window: windowFromAsOf(ms), source: "context_files" };
}

function tryExplicit(explicitAsOf: unknown): AsOfData | undefined {
  const ms = toUtcDateOnlyMs(explicitAsOf);
  if (ms === undefined) {
    return undefined;
  }
  return { asOf: formatUtcDateOnly(ms), window: windowFromAsOf(ms), source: "explicit" };
}

/**
 * Dérive `as_of` et la fenêtre d'analyse à partir des sources disponibles, dans
 * l'ordre de précédence documenté en tête de fichier. Pure : même `input` ⇒
 * même `AsOfResult`, quel que soit le fuseau horaire ou l'heure de la machine.
 */
export function deriveAsOf(input: AsOfInput): AsOfResult {
  const fromPeriod = tryPeriod(input.period);
  if (fromPeriod !== undefined) {
    return { status: "ok", data: fromPeriod };
  }

  const fromMergedAts = tryMergedAts(input.mergedAts);
  if (fromMergedAts !== undefined) {
    return { status: "ok", data: fromMergedAts };
  }

  const fromContextFiles = tryContextFiles(input.contextFilesLastUpdated);
  if (fromContextFiles !== undefined) {
    return { status: "ok", data: fromContextFiles };
  }

  const fromExplicit = tryExplicit(input.explicitAsOf);
  if (fromExplicit !== undefined) {
    return { status: "ok", data: fromExplicit };
  }

  return {
    status: "unknown",
    reason:
      "aucune source de date de référence exploitable (period, merged_at, context_files.last_updated, --as-of)",
  };
}
