/**
 * Schéma et parsing de l'entrée du mode CLI `export` (`recognaize export --in
 * <fichier>`) : le contenu DÉJÀ JUGÉ (rang/fourchette/confiance/axes/
 * ownership/verdicts/evidence/warnings/incoherences), jamais les champs
 * administratifs que `src/cli.ts` sait déjà recalculer lui-même
 * (`schema_version`/`tool_version`/`referentiel_hash`/`node_version`/
 * `pieces_et_champs_ignores` — voir `report/json.ts`.`buildResultDocument`,
 * jamais dupliqué ici) — voir `aidd_docs/tasks/2026_08/2026_08_31_agentic-report-html-parity/plan.md`.
 *
 * PUR par construction — même posture que `report/html.ts` : aucune E/S (la
 * lecture du fichier `--in` reste dans `src/cli.ts`), aucune horloge. Un
 * champ manquant ou mal typé ⇒ échec de parsing avec un message nommant le
 * champ fautif — jamais une valeur devinée (même exigence que
 * `core/referentiel.ts` sur `referentiel.json`, mais restituée en
 * `{ok,data}|{ok:false,error}` plutôt qu'une exception, pour que
 * `src/cli.ts` reste l'unique frontière qui lève — `.claude/rules/fiabilite.md`).
 *
 * Ne porte JAMAIS de champ `declaratif` : `ReportExtras.gitActivity`/
 * `sonarMeasures` sont dérivées par `src/cli.ts` lui-même depuis
 * `--profile-dir` (adaptateurs `src/sources/git-activity.ts`/`sonar.ts`
 * déjà existants, jamais recalculés ici) — `declaratif.md` n'est structurellement
 * jamais lu par ce mode (DEC-004), et ce schéma n'offre même pas la
 * possibilité de l'y glisser via `--in`.
 */

import { z } from "zod";

import type { AgenticContext } from "./html.js";
import type { AsOfField } from "./json.js";
import { RANGS_ORDONNES, type Evidence, type Rang, type Verdict } from "../core/types.js";
import type { AxisJudgement, OwnershipJudgement } from "../core/judge.js";

const RANG_TUPLE = RANGS_ORDONNES as unknown as [Rang, ...Rang[]];
const RangSchema = z.enum(RANG_TUPLE);

const AsOfSchema = z.union([
  z.string().min(1),
  z.object({ status: z.literal("unknown"), reason: z.string() }),
]);

const ValueSchema = z.object({
  type: z.enum(["number", "ratio", "count", "enum", "boolean"]),
  unite: z.string(),
});

const EvidenceSchema = z.object({
  id: z.string().min(1),
  signal_id: z.string().min(1),
  valeur: ValueSchema,
  source: z.enum(["GA", "PR", "RC", "S", "SO", "SU", "DEC"]),
  check_id: z.string().min(1),
  path_id: z.string().min(1),
  concept_id: z.string().min(1),
  axe: z.enum(["T", "H", "I", "P", "O"]),
  polarite: z.enum(["preuve", "contre-preuve"]),
  force: z.enum(["prouve", "indice"]),
  citation: z.string().optional(),
  confiance_source: z.number(),
});

const EtatMarcheSchema = z.object({
  marche: z.string().min(1),
  etat: z.enum(["infirmé", "prouvé", "indice", "compris", "déclaré", "inconnu"]),
});

const VerdictSchema = z.object({
  axe: z.enum(["T", "H", "I", "P", "O"]),
  niveau_prouve: z.string().nullable(),
  niveau_ponctuel: z.string().nullable(),
  marche_bloquante: z.string().optional(),
  raison: z.string(),
  etats: z.array(EtatMarcheSchema),
});

const AxisJudgementSchema = z.object({
  axe: z.enum(["T", "H", "I", "P", "O"]),
  niveau_prouve: z.string().nullable(),
  niveau_ponctuel: z.string().nullable(),
  plafond_potentiel: z.string().nullable(),
  etats: z.array(EtatMarcheSchema),
  couverture: z.number(),
  accord: z.number(),
  confiance: z.number(),
  observe: z.boolean(),
});

const OwnershipJudgementSchema = z.object({
  niveau_prouve: z.string().nullable(),
  niveau_ponctuel: z.string().nullable(),
  etats: z.array(EtatMarcheSchema),
  rabais_applique: z.boolean(),
  mention: z.string().optional(),
});

const FourchetteSchema = z.object({
  bas: RangSchema,
  haut: RangSchema,
});

/**
 * Forme exacte produite par `core/paths.ts`.`sanitizeSubject` (`<slug ascii>-<hash hex 8>`)
 * — jamais un identifiant brut. `sanitizeSubject` n'est PAS idempotente (le hash
 * dépend de la chaîne d'entrée) : la réappliquer à un `profile_id` déjà assaini
 * produirait un second dossier de sortie, différent de celui du run déterministe
 * du même profil — `profile_id` doit donc être VALIDÉ ici comme déjà assaini,
 * jamais réassaini par `src/cli.ts` (bug réel trouvé en vérification bout-en-bout,
 * 2026-08-31 : voir `aidd_docs/tasks/2026_08/2026_08_31_agentic-report-html-parity/phase-3.md`).
 */
const SANITIZED_SUBJECT_PATTERN = /^[a-z0-9-]+-[0-9a-f]{8}$/;

/** Contenu déjà jugé nécessaire au rendu — jamais les champs administratifs (voir en-tête de ce fichier). */
export const DocumentInputSchema = z.object({
  profile_id: z
    .string()
    .regex(SANITIZED_SUBJECT_PATTERN, "doit déjà être un identifiant assaini (core/paths.ts.sanitizeSubject), jamais un identifiant brut"),
  status: z.enum(["ok", "indeterminate"]),
  rang_prouve: RangSchema.nullable(),
  rang_ponctuel: RangSchema.nullable(),
  rang_affiche: RangSchema.nullable(),
  fourchette: FourchetteSchema,
  confiance_globale: z.number(),
  axes: z.array(AxisJudgementSchema),
  ownership: OwnershipJudgementSchema,
  verdicts: z.array(VerdictSchema),
  evidence: z.array(EvidenceSchema),
  warnings: z.array(z.string()),
  incoherences: z.array(z.string()),
  as_of: AsOfSchema.optional(),
});

const TokenEstimateSchema = z.object({
  prompt_chars: z.number(),
  output_chars: z.number(),
  estimated_tokens: z.number(),
  note: z.string(),
});

const CostEstimateSchema = z.object({
  usd: z.number(),
  note: z.string(),
});

const AgenticAxisConfidenceSchema = z.object({
  axe: z.enum(["T", "H", "I", "P", "O"]),
  niveau_prouve: z.string().nullable(),
  confiance: z.number(),
});

const AgenticComparisonRowSchema = z.object({
  axe: z.enum(["T", "H", "I", "P", "O"]),
  deterministic: z.string().nullable(),
  agentic: z.string().nullable(),
  match: z.boolean(),
});

/** Miroir strict de `AgenticContext` (`report/html.ts`) — voir ce type pour la raison de chaque champ. */
export const AgenticContextSchema = z.object({
  deterministic: z.object({
    rang_affiche: RangSchema.nullable(),
    fourchette: FourchetteSchema,
    confiance_globale: z.number(),
    axes: z.array(AgenticAxisConfidenceSchema),
    incoherences: z.array(z.string()),
  }),
  comparison: z.object({
    rows: z.array(AgenticComparisonRowSchema),
    mismatch_notes: z.array(z.string()),
  }),
  execution: z.object({
    model: z.string().min(1),
    token_estimate: TokenEstimateSchema,
    cost_estimate: CostEstimateSchema,
    generated_at: z.string().min(1),
  }),
});

export const ExportInputSchema = z.object({
  document: DocumentInputSchema,
  agentic_context: AgenticContextSchema.optional(),
});

/** Contenu déjà jugé porté par `--in` — sous-ensemble de `ResultDocument` (`report/json.ts`), sans les champs administratifs. */
export type DocumentInput = z.infer<typeof DocumentInputSchema> & {
  readonly axes: readonly AxisJudgement[];
  readonly ownership: OwnershipJudgement;
  readonly verdicts: readonly Verdict[];
  readonly evidence: readonly Evidence[];
  readonly as_of?: AsOfField;
};

export type ExportInput = z.infer<typeof ExportInputSchema> & {
  readonly document: DocumentInput;
  readonly agentic_context?: AgenticContext;
};

export type ParseExportInputResult = { readonly ok: true; readonly data: ExportInput } | { readonly ok: false; readonly error: string };

function formatZodError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => `  - ${issue.path.join(".") || "(racine)"} : ${issue.message}`);
  return `Entrée d'export invalide :\n${lines.join("\n")}`;
}

/**
 * Parse et valide l'entrée `--in` du mode `export`. Pure : ne lit rien, ne
 * lève jamais — `src/cli.ts` traduit `{ok:false}` en `UsageError` (exit 3),
 * seule frontière autorisée à lever (`.claude/rules/fiabilite.md`).
 */
export function parseExportInput(raw: unknown): ParseExportInputResult {
  const result = ExportInputSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: formatZodError(result.error) };
  }
  return { ok: true, data: result.data as ExportInput };
}
