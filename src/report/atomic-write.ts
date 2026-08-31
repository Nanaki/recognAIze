/**
 * Écriture atomique d'un fichier texte : fichier temporaire dans le MÊME
 * dossier que la cible, puis `rename` — jamais de fichier tronqué visible en
 * cas d'interruption (`.claude/rules/fiabilite.md`). `rename` est atomique sur
 * un même système de fichiers (POSIX et NTFS) ; placer le fichier temporaire
 * dans le dossier cible plutôt que dans un `tmpdir()` séparé évite tout risque
 * de `rename` inter-systèmes-de-fichiers, qui ne serait plus atomique.
 *
 * Utilisée par `src/core/resultWriter.ts` (result.json) et `src/report/runs.ts`
 * (historique `runs/<horodatage>.json`) — le nom `report/` reflète l'usage
 * principal, mais ce module reste un utilitaire filesystem générique sans
 * dépendance au schéma de `result.json`.
 */

import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Écrit `content` dans `filePath`, en créant le dossier parent si besoin.
 * N'expose jamais un fichier partiellement écrit à la place de `filePath` :
 * soit l'ancien contenu reste (échec avant le `rename`), soit le nouveau
 * contenu est intégralement présent (après).
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, `.tmp-${process.pid}-${randomBytes(6).toString("hex")}`);
  try {
    writeFileSync(tmpPath, content, "utf8");
    renameSync(tmpPath, filePath);
  } catch (cause) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Best effort : le fichier temporaire peut ne pas exister si l'échec est survenu avant writeFileSync.
    }
    throw cause;
  }
}
