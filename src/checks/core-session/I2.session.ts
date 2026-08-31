/**
 * `I2.p2` (« cadre avant », voie session). Preuve/contre-preuve
 * (force `"indice"`, figée par `referentiel.json` — voir `lib/session-signals.ts`,
 * tête de fichier) : `S.first_prompt_framed` — objectif + chemin plausible +
 * contrainte détectés n'importe où dans le digest (`lib/session-signals.ts`.`firstPromptFramed`).
 * Négation complète par défaut pour la contre-preuve — suffit ici, une session
 * peut infirmer.
 */

import type { Check } from "../../core/types.js";
import { evaluateProofPathDefault, type SignalValue } from "../../lib/threshold-eval.js";
import { firstPromptFramed } from "../../lib/session-signals.js";

const CHECK_ID = "I2.session";
const PATH_ID = "I2.p2";

const check: Check = {
  id: CHECK_ID,
  axe: "I",
  marche: "I2",
  sources: ["S"],
  pack: "core-session",
  enabled: true,
  path_ids: [PATH_ID],
  run: (context, referentiel) => {
    const signals: Record<string, SignalValue> = {
      "S.first_prompt_framed": firstPromptFramed(context.session),
    };
    const evidence = evaluateProofPathDefault({ referentiel, checkId: CHECK_ID, pathId: PATH_ID, axe: "I", signals });
    return evidence === undefined ? [] : [evidence];
  },
};

export default check;
