// Écriture de `result.json`. `writeProvisionalResult` reste utilisé pour le seul
// cas de refus (exit 2 — dossier vide ou réduit à `profile.json` seul, voir
// `cli.ts`) : schéma minimal (`schema_version` + `status`). Un profil réellement
// analysé passe par le schéma FINAL (`src/report/json.ts`.`ResultDocument`,
// `RESULT_SCHEMA_VERSION`), écrit par {@link writeResultDocument} ci-dessous.
//
// Les deux écritures (refus et analyse) passent par `src/report/atomic-write.ts`
// (tmp + rename) plutôt que `writeFileSync` direct — un import `core/` →
// `report/` reste autorisé : seule la direction `core/` → `checks/` est bannie
// par `.claude/rules/fiabilite.md` (voir `eslint.config.js`,
// `no-restricted-imports` scoped à `src/core/**`).

import { join } from "node:path";

import { atomicWriteFileSync } from "../report/atomic-write.js";
import type { ResultDocument } from "../report/json.js";

export const PROVISIONAL_SCHEMA_VERSION = "0.0.0-provisional";

export type ResultStatus = "ok" | "refused";

export interface ProvisionalResult {
  readonly schema_version: string;
  readonly status: ResultStatus;
}

/** Écrit `<outputDir>/result.json` (refus), atomiquement — crée `outputDir` si besoin. */
export function writeProvisionalResult(outputDir: string, status: ResultStatus): void {
  const result: ProvisionalResult = {
    schema_version: PROVISIONAL_SCHEMA_VERSION,
    status,
  };
  const resultPath = join(outputDir, "result.json");
  atomicWriteFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
}

/** Écrit `<outputDir>/result.json` pour un profil réellement analysé (schéma final), atomiquement. */
export function writeResultDocument(outputDir: string, document: ResultDocument): void {
  const resultPath = join(outputDir, "result.json");
  atomicWriteFileSync(resultPath, `${JSON.stringify(document, null, 2)}\n`);
}
