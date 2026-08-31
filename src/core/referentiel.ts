/**
 * Chargement et validation de `src/referentiel.json`, la source de vérité unique
 * des seuils (`.claude/rules/fiabilite.md` : « les seuils vivent dans
 * referentiel.json, jamais en littéraux dans les checks »).
 *
 * Seul schéma **strict** (`.strict()`, jamais `.passthrough()`) de tout le
 * dépôt : `referentiel.json` est le contrat interne du juge, toute clé inconnue
 * y est un défaut à signaler immédiatement, contrairement aux pièces de profil
 * (tolérantes par construction — champ inconnu = ignoré, jamais une erreur).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { z } from "zod";

import { resolveReferentielPath } from "./paths.js";
import type { AxeId, Comparator, Force, SourceId, ValueType } from "./types.js";

const AXIS_IDS = ["T", "H", "I", "P", "O"] as const satisfies readonly AxeId[];
const SOURCE_IDS = ["GA", "PR", "RC", "S", "SO", "SU", "DEC"] as const satisfies readonly SourceId[];
const FORCES = ["prouve", "indice"] as const satisfies readonly Force[];
const COMPARATORS = ["gte", "lte", "gt", "lt", "eq"] as const satisfies readonly Comparator[];
const VALUE_TYPES = ["number", "ratio", "count", "enum", "boolean"] as const satisfies readonly ValueType[];
const RANK_KEYS = ["red", "blue", "green", "copper", "silver", "gold"] as const;

/** Les 5 marches « défaut » : prouvées dès une preuve d'usage IA, jamais par seuil. */
const DEFAULT_MARCHE_IDS: ReadonlySet<string> = new Set(["T1", "H1", "I1", "P1", "O1"]);

const MARCHE_ID_PATTERN = /^[A-Z]\d+$/;
const PATH_ID_PATTERN = /^[A-Z]\d+\.p\d+$/;

// ---------------------------------------------------------------------------
// Schéma Zod strict
// ---------------------------------------------------------------------------

const ConditionSchema = z
  .object({
    kind: z.literal("condition"),
    signal_id: z.string().min(1),
    comparator: z.enum(COMPARATORS),
    value: z.union([z.number(), z.string(), z.boolean()]),
    value_type: z.enum(VALUE_TYPES),
    unit: z.string().min(1).optional(),
  })
  .strict();

/**
 * Expression booléenne de seuil : une condition élémentaire, ou une combinaison
 * `and`/`or` d'expressions (nécessaire pour des marches comme I4 — ratio ET
 * co-autorat — ou T2.p2 — fichiers OU lignes). Récursive via `z.lazy`.
 */
type ThresholdExpr =
  | z.infer<typeof ConditionSchema>
  | { readonly kind: "and"; readonly of: readonly ThresholdExpr[] }
  | { readonly kind: "or"; readonly of: readonly ThresholdExpr[] };

const ThresholdExprSchema: z.ZodType<ThresholdExpr> = z.lazy(() =>
  z.union([
    ConditionSchema,
    z
      .object({
        kind: z.literal("and"),
        of: z.array(ThresholdExprSchema).min(2),
      })
      .strict(),
    z
      .object({
        kind: z.literal("or"),
        of: z.array(ThresholdExprSchema).min(2),
      })
      .strict(),
  ]),
);

const ProofPathSchema = z
  .object({
    path_id: z.string().regex(PATH_ID_PATTERN),
    description: z.string().min(1),
    force: z.enum(FORCES),
    signal_id: z.string().min(1),
    source: z.enum(SOURCE_IDS),
  })
  .strict();

const CounterProofSchema = z
  .object({
    description: z.string().min(1),
    signal_id: z.string().min(1).optional(),
  })
  .strict();

const MarcheSchema = z
  .object({
    id: z.string().regex(MARCHE_ID_PATTERN),
    label: z.string().min(1),
    default: z.boolean(),
    proof_paths: z.array(ProofPathSchema),
    counter_proof: CounterProofSchema.nullable(),
  })
  .strict();

const AxisSchema = z
  .object({
    id: z.enum(AXIS_IDS),
    label: z.string().min(1),
    reference_source: z.array(z.enum(SOURCE_IDS)).min(1),
    marches: z.array(MarcheSchema).min(1),
  })
  .strict();

const OwnershipSchema = z
  .object({
    blocking: z.boolean(),
    marches: z.array(z.string().regex(/^O\d+$/)).min(1),
  })
  .strict();

const ConfianceSourceSchema = z
  .object(Object.fromEntries(SOURCE_IDS.map((source) => [source, z.number().min(0).max(1)])) as Record<
    (typeof SOURCE_IDS)[number],
    z.ZodNumber
  >)
  .strict();

/**
 * Ordre de précédence des sources en cas de contradiction sur une même marche
 * (`core/judge.ts`.`resolveMarcheEtat`) — un CONCEPT DIFFÉRENT de
 * `confiance_source` (poids numérique pour la confiance globale) : les deux
 * ne coïncident pas nécessairement (ex. `PR` devant `GA` ici, malgré
 * `confiance_source.GA` > `confiance_source.PR`) et ce n'est pas une erreur —
 * voir `docs/referentiel.md` § Précédence des sources pour la justification
 * complète. Doit être une permutation EXACTE de tous les `SourceId` (validé
 * ci-dessous) : aucun doublon, aucun oubli — {@link resolveMarcheEtat} suppose
 * une couverture totale (filet de sécurité sinon, jamais un crash, mais un
 * résultat dégradé).
 *
 * Champ unique lu à la fois par `core/judge.ts` et `report/explain.ts` :
 * aucune copie littérale à maintenir à la main ailleurs dans le dépôt.
 */
const SourcePrecedenceSchema = z
  .array(z.enum(SOURCE_IDS))
  .length(SOURCE_IDS.length)
  .refine((arr) => new Set(arr).size === arr.length, {
    message: "source_precedence doit être une permutation sans doublon de tous les SourceId.",
  })
  .refine((arr) => SOURCE_IDS.every((source) => arr.includes(source)), {
    message: "source_precedence doit contenir tous les SourceId du référentiel.",
  });

const LadderSchema = z
  .object(
    Object.fromEntries(RANK_KEYS.map((rank) => [rank, z.array(z.string().regex(/^[THIP]\d+$/)).min(1)])) as Record<
      (typeof RANK_KEYS)[number],
      z.ZodArray<z.ZodString>
    >,
  )
  .strict();

const RootSchema = z
  .object({
    schema_version: z.string().min(1),
    axes: z.array(AxisSchema).min(1),
    thresholds: z.record(z.string(), ThresholdExprSchema),
    ladder: LadderSchema,
    ownership: OwnershipSchema,
    confiance_source: ConfianceSourceSchema,
    source_precedence: SourcePrecedenceSchema,
  })
  .strict()
  .superRefine((referentiel, ctx) => {
    validateNonDefaultMarchesHaveProofPathsAndThresholds(referentiel, ctx);
    validatePathIdsPrefixedByOwningMarche(referentiel, ctx);
    validateLadderReferencesKnownOfficialMarches(referentiel, ctx);
  });

function validateNonDefaultMarchesHaveProofPathsAndThresholds(
  referentiel: { axes: readonly { id: string; marches: readonly { id: string; default: boolean; proof_paths: readonly { path_id: string }[] }[] }[]; thresholds: Record<string, unknown> },
  ctx: z.RefinementCtx,
): void {
  for (const axis of referentiel.axes) {
    for (const marche of axis.marches) {
      if (DEFAULT_MARCHE_IDS.has(marche.id)) {
        continue;
      }
      if (marche.proof_paths.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: `Marche "${marche.id}" (axe ${axis.id}) : aucun chemin de preuve — au moins un path_id est requis pour toute marche non « défaut ».`,
          path: ["axes"],
        });
        continue;
      }
      for (const proofPath of marche.proof_paths) {
        if (!(proofPath.path_id in referentiel.thresholds)) {
          ctx.addIssue({
            code: "custom",
            message: `Seuil manquant pour le chemin de preuve "${proofPath.path_id}" (marche ${marche.id}, axe ${axis.id}) : chaque path_id d'une marche non « défaut » doit avoir un seuil dans "thresholds".`,
            path: ["thresholds", proofPath.path_id],
          });
        }
      }
    }
  }
}

function validatePathIdsPrefixedByOwningMarche(
  referentiel: { axes: readonly { id: string; marches: readonly { id: string; proof_paths: readonly { path_id: string }[] }[] }[] },
  ctx: z.RefinementCtx,
): void {
  for (const axis of referentiel.axes) {
    for (const marche of axis.marches) {
      for (const proofPath of marche.proof_paths) {
        if (!proofPath.path_id.startsWith(`${marche.id}.`)) {
          ctx.addIssue({
            code: "custom",
            message: `Le chemin de preuve "${proofPath.path_id}" n'appartient pas à la marche "${marche.id}" (axe ${axis.id}) : un path_id doit être préfixé par l'identifiant de sa marche.`,
            path: ["axes"],
          });
        }
      }
    }
  }
}

function validateLadderReferencesKnownOfficialMarches(
  referentiel: {
    axes: readonly { id: string; marches: readonly { id: string }[] }[];
    ladder: Record<string, readonly string[]>;
  },
  ctx: z.RefinementCtx,
): void {
  const knownOfficialMarcheIds = new Set(
    referentiel.axes.filter((axis) => axis.id !== "O").flatMap((axis) => axis.marches.map((marche) => marche.id)),
  );
  for (const [rank, marcheIds] of Object.entries(referentiel.ladder)) {
    for (const marcheId of marcheIds) {
      if (!knownOfficialMarcheIds.has(marcheId)) {
        ctx.addIssue({
          code: "custom",
          message: `La ligne de montée du rang "${rank}" cite la marche "${marcheId}", absente des 4 axes officiels (T/H/I/P) du référentiel.`,
          path: ["ladder", rank],
        });
      }
    }
  }
}

export type Referentiel = z.infer<typeof RootSchema>;
export type { ThresholdExpr };

/** Erreur de démarrage : `referentiel.json` est absent, illisible ou invalide. */
export class ReferentielInvalideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferentielInvalideError";
  }
}

function formatZodError(error: z.ZodError, filePath: string): string {
  const lines = error.issues.map((issue) => `  - ${issue.path.join(".")} : ${issue.message}`);
  return `Référentiel invalide (${filePath}) :\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

export interface LoadedReferentiel {
  readonly referentiel: Referentiel;
  readonly referentiel_hash: string;
}

/**
 * Charge et valide `referentiel.json` (par défaut : celui livré avec l'outil,
 * résolu par {@link resolveReferentielPath}, indépendant du répertoire courant).
 * Lève {@link ReferentielInvalideError} — nommant l'élément fautif — si le fichier
 * est absent, illisible (JSON invalide) ou ne respecte pas le schéma strict.
 */
export function loadReferentiel(filePath: string = resolveReferentielPath()): LoadedReferentiel {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ReferentielInvalideError(`Référentiel introuvable ou illisible (${filePath}) : ${detail}`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ReferentielInvalideError(`Référentiel JSON invalide (${filePath}) : ${detail}`);
  }

  const result = RootSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new ReferentielInvalideError(formatZodError(result.error, filePath));
  }

  return {
    referentiel: result.data,
    referentiel_hash: computeReferentielHash(result.data),
  };
}

/**
 * Accesseur de seuil par `path_id`. Lève si le `path_id` est inconnu du
 * référentiel chargé (ne devrait jamais arriver sur un référentiel validé par
 * {@link loadReferentiel}, mais protège tout appelant direct).
 */
export function thresholdFor(referentiel: Referentiel, pathId: string): ThresholdExpr {
  const threshold = referentiel.thresholds[pathId];
  if (threshold === undefined) {
    throw new ReferentielInvalideError(`Seuil introuvable pour le chemin de preuve "${pathId}".`);
  }
  return threshold;
}

// ---------------------------------------------------------------------------
// referentiel_hash — stable entre exécutions : stringify canonique (clés triées
// récursivement) puis sha256. Aucune dépendance à Date.now(), Intl ou à l'ordre
// des clés tel qu'écrit dans le fichier source.
// ---------------------------------------------------------------------------

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Empreinte stable du référentiel : même contenu logique ⇒ même hash, quel que soit l'ordre des clés. */
export function computeReferentielHash(referentiel: Referentiel): string {
  return createHash("sha256").update(canonicalStringify(referentiel), "utf8").digest("hex");
}
