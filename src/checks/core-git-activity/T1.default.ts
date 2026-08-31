/**
 * Marche par défaut `T1` (« tâche S », axe Taille). NO-OP délibéré, jamais un
 * oubli. `T1` (comme `H1`/`I1`/`P1`/`O1`) est déclarée `"default": true` dans
 * `src/referentiel.json` avec `proof_paths: []` — validé par
 * `core/referentiel.ts` (`validateNonDefaultMarchesHaveProofPathsAndThresholds`
 * saute explicitement les marches par défaut, donc aucun `path_id` ni seuil
 * n'existe pour `T1`). Un check ne peut déclarer que des `path_ids` présents
 * dans `referentiel.thresholds` (`core/registry.ts`.`buildRegistry` lève
 * sinon) : il est donc structurellement impossible de produire une `Evidence`
 * rattachée à `T1`.
 *
 * Le séquençage réel est entièrement dans `core/judge.ts`.`computeAxis` : quand
 * `hasAiUsageProof` (détecteur `src/lib/ai-usage-proof.ts`, appelé par
 * `src/analyze.ts` avant `judge()`) est vrai, chaque marche `default` de son axe
 * est semée à `"prouvé"` automatiquement — sans passer par une `Evidence`. Ce
 * fichier existe uniquement pour respecter la convention de nommage
 * `<marche>.<source>.ts` et pour que `T1` apparaisse dans le registre (utile pour
 * `recognaize checks list`, l'explicabilité et les futurs outils qui listent les
 * checks pack par pack) — son `run` ne produit jamais rien, par construction.
 */

import type { Check } from "../../core/types.js";

const check: Check = {
  id: "T1.default",
  axe: "T",
  marche: "T1",
  sources: ["GA"],
  pack: "core-git-activity",
  enabled: true,
  path_ids: [],
  run: () => [],
};

export default check;
