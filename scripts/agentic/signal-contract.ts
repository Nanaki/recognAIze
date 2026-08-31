/**
 * Extrait, pour chaque axe du référentiel, la liste des VRAIS signal_id
 * exigés par les expressions de seuil (`referentiel.json`.`thresholds`),
 * pas le champ `proof_paths[].signal_id` (qui n'est qu'une étiquette
 * lisible et peut ne représenter qu'une partie de l'expression réelle —
 * vérifié : H3.p2 exige `GA.agents_md` ET `GA.agents_md_last_updated_in_window`,
 * deux signaux, alors que sa description n'en nomme qu'un).
 *
 * Sert à construire le contrat d'extraction donné à chaque sous-agent LLM :
 * il ne doit renvoyer QUE des valeurs pour des signal_id de cette liste,
 * jamais en inventer un nouveau.
 *
 * Usage : npx tsx scripts/agentic/signal-contract.ts [axeId]
 */
import { loadReferentiel } from "../../src/core/referentiel.js";
import type { ThresholdExpr } from "../../src/core/referentiel.js";
import type { AxeId } from "../../src/core/types.js";
import { SIGNAL_NOTES } from "./signal-notes.js";

export interface SignalSpec {
  readonly signal_id: string;
  readonly comparator: string;
  readonly value: unknown;
  readonly value_type: string;
  readonly unit?: string;
  readonly path_id: string;
  readonly marche: string;
  readonly note?: string;
}

function walkExpr(expr: ThresholdExpr, pathId: string, marche: string, out: SignalSpec[]): void {
  if (expr.kind === "condition") {
    out.push({
      signal_id: expr.signal_id,
      comparator: expr.comparator,
      value: expr.value,
      value_type: expr.value_type,
      unit: (expr as { unit?: string }).unit,
      path_id: pathId,
      marche,
      note: SIGNAL_NOTES[expr.signal_id],
    });
    return;
  }
  for (const sub of expr.of) {
    walkExpr(sub, pathId, marche, out);
  }
}

export function buildSignalContractByAxis(
  referentiel: ReturnType<typeof loadReferentiel>["referentiel"],
): Record<AxeId, SignalSpec[]> {
  const byAxis: Record<string, SignalSpec[]> = {};
  for (const axis of referentiel.axes) {
    byAxis[axis.id] = [];
    for (const marche of axis.marches) {
      for (const proofPath of marche.proof_paths) {
        const expr = referentiel.thresholds[proofPath.path_id];
        if (expr === undefined) continue;
        walkExpr(expr, proofPath.path_id, marche.id, byAxis[axis.id]);
      }
    }
  }
  return byAxis as Record<AxeId, SignalSpec[]>;
}

function main(): void {
  const { referentiel } = loadReferentiel();
  const byAxis = buildSignalContractByAxis(referentiel);
  const filterAxe = process.argv[2];
  const out = filterAxe !== undefined ? { [filterAxe]: byAxis[filterAxe as AxeId] } : byAxis;
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

if (process.argv[1]?.endsWith("signal-contract.ts")) {
  main();
}
