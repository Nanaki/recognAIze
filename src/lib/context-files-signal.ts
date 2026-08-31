/**
 * Signal partagé « `context_files` tout à zéro ». Consommé par `H2`, `H3`,
 * `H4`, `H5` (`src/checks/core-git-activity/*.git-activity.ts`) pour leur
 * contre-preuve : une règle UNIQUE (« `context_files` tous à zéro ⇒ H2 à H7
 * infirmées ») plutôt qu'une négation individuelle par check. `H6`/`H7`
 * consomment ce même signal depuis `RC` (repo-context).
 *
 * Absence totale de la section `context_files` ⇒ `undefined` (on ne sait rien,
 * jamais une contre-preuve implicite) ; section présente ⇒ chaque champ manquant
 * vaut son zéro/`false` (compteur absent = compteur nul pour cette règle).
 */

import type { GitActivityData } from "../sources/git-activity.js";

export function contextFilesAllZero(gitActivity: GitActivityData | undefined): boolean | undefined {
  const contextFiles = gitActivity?.context_files;
  if (contextFiles === undefined) {
    return undefined;
  }
  const agentsMd = contextFiles.agents_md ?? false;
  const rules = contextFiles.rules_count ?? 0;
  const skills = contextFiles.skills_count ?? 0;
  const hooks = contextFiles.hooks_count ?? 0;
  const agents = contextFiles.agents_count ?? 0;
  return agentsMd === false && rules === 0 && skills === 0 && hooks === 0 && agents === 0;
}
