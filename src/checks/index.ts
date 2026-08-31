/**
 * GÉNÉRÉ — ne pas éditer à la main.
 *
 * Produit par `scripts/gen-checks-index.ts` (`npm run prebuild` / `npm run checks:index`).
 * Imports statiques triés par chemin de fichier, par points de code (jamais
 * `Intl`/`localeCompare`) — aucune découverte par glob à l'exécution, voir
 * `aidd_docs/memory/architecture.md`.
 */

import type { Check } from "../core/types.js";

import check0 from "./core-git-activity/H1.default.js";
import check1 from "./core-git-activity/H2.git-activity.js";
import check2 from "./core-git-activity/H3.git-activity.js";
import check3 from "./core-git-activity/H4.git-activity.js";
import check4 from "./core-git-activity/H5.git-activity.js";
import check5 from "./core-git-activity/I1.default.js";
import check6 from "./core-git-activity/I2.git-activity.js";
import check7 from "./core-git-activity/I2.setup.js";
import check8 from "./core-git-activity/I3.git-activity.js";
import check9 from "./core-git-activity/I4.git-activity.js";
import check10 from "./core-git-activity/I4.pull-requests.js";
import check11 from "./core-git-activity/I5.pull-requests.js";
import check12 from "./core-git-activity/O1.default.js";
import check13 from "./core-git-activity/O2.git-activity.js";
import check14 from "./core-git-activity/O3.pull-requests.js";
import check15 from "./core-git-activity/P1.default.js";
import check16 from "./core-git-activity/P2.git-activity.js";
import check17 from "./core-git-activity/P3.git-activity.js";
import check18 from "./core-git-activity/P3.pull-requests.js";
import check19 from "./core-git-activity/T1.default.js";
import check20 from "./core-git-activity/T2.git-activity.js";
import check21 from "./core-git-activity/T2.pull-requests.js";
import check22 from "./core-git-activity/T2.setup.js";
import check23 from "./core-git-activity/T3.git-activity.js";
import check24 from "./core-git-activity/T3.pull-requests.js";
import check25 from "./core-git-activity/T4.git-activity.js";
import check26 from "./core-repo-context/H2.repo-context.js";
import check27 from "./core-repo-context/H3.repo-context.js";
import check28 from "./core-repo-context/H4.repo-context.js";
import check29 from "./core-repo-context/H5.repo-context.js";
import check30 from "./core-repo-context/H6.repo-context.js";
import check31 from "./core-repo-context/H7.repo-context.js";
import check32 from "./core-repo-context/O2.sonar.js";
import check33 from "./core-repo-context/O3.repo-context.js";
import check34 from "./core-repo-context/O4.repo-context.js";
import check35 from "./core-repo-context/O5.repo-context.js";
import check36 from "./core-session/H1.session.js";
import check37 from "./core-session/H6.session.js";
import check38 from "./core-session/H7.session.js";
import check39 from "./core-session/I2.session.js";
import check40 from "./core-session/I3.session.js";
import check41 from "./core-session/O1.session.js";
import check42 from "./core-session/O2.session.js";
import check43 from "./core-session/O3.session.js";
import check44 from "./core-session/O4.session.js";
import check45 from "./core-session/P2.session.js";
import check46 from "./core-session/T2.session.js";
import check47 from "./core-session/T3.session.js";

/** Un fichier physiquement présent sous `src/checks/**`, avec le `Check` qu'il exporte par défaut. */
export interface DiscoveredCheckEntry {
  readonly file: string;
  readonly check: Check;
}

export const DISCOVERED_CHECKS: readonly DiscoveredCheckEntry[] = [
  { file: "core-git-activity/H1.default.ts", check: check0 },
  { file: "core-git-activity/H2.git-activity.ts", check: check1 },
  { file: "core-git-activity/H3.git-activity.ts", check: check2 },
  { file: "core-git-activity/H4.git-activity.ts", check: check3 },
  { file: "core-git-activity/H5.git-activity.ts", check: check4 },
  { file: "core-git-activity/I1.default.ts", check: check5 },
  { file: "core-git-activity/I2.git-activity.ts", check: check6 },
  { file: "core-git-activity/I2.setup.ts", check: check7 },
  { file: "core-git-activity/I3.git-activity.ts", check: check8 },
  { file: "core-git-activity/I4.git-activity.ts", check: check9 },
  { file: "core-git-activity/I4.pull-requests.ts", check: check10 },
  { file: "core-git-activity/I5.pull-requests.ts", check: check11 },
  { file: "core-git-activity/O1.default.ts", check: check12 },
  { file: "core-git-activity/O2.git-activity.ts", check: check13 },
  { file: "core-git-activity/O3.pull-requests.ts", check: check14 },
  { file: "core-git-activity/P1.default.ts", check: check15 },
  { file: "core-git-activity/P2.git-activity.ts", check: check16 },
  { file: "core-git-activity/P3.git-activity.ts", check: check17 },
  { file: "core-git-activity/P3.pull-requests.ts", check: check18 },
  { file: "core-git-activity/T1.default.ts", check: check19 },
  { file: "core-git-activity/T2.git-activity.ts", check: check20 },
  { file: "core-git-activity/T2.pull-requests.ts", check: check21 },
  { file: "core-git-activity/T2.setup.ts", check: check22 },
  { file: "core-git-activity/T3.git-activity.ts", check: check23 },
  { file: "core-git-activity/T3.pull-requests.ts", check: check24 },
  { file: "core-git-activity/T4.git-activity.ts", check: check25 },
  { file: "core-repo-context/H2.repo-context.ts", check: check26 },
  { file: "core-repo-context/H3.repo-context.ts", check: check27 },
  { file: "core-repo-context/H4.repo-context.ts", check: check28 },
  { file: "core-repo-context/H5.repo-context.ts", check: check29 },
  { file: "core-repo-context/H6.repo-context.ts", check: check30 },
  { file: "core-repo-context/H7.repo-context.ts", check: check31 },
  { file: "core-repo-context/O2.sonar.ts", check: check32 },
  { file: "core-repo-context/O3.repo-context.ts", check: check33 },
  { file: "core-repo-context/O4.repo-context.ts", check: check34 },
  { file: "core-repo-context/O5.repo-context.ts", check: check35 },
  { file: "core-session/H1.session.ts", check: check36 },
  { file: "core-session/H6.session.ts", check: check37 },
  { file: "core-session/H7.session.ts", check: check38 },
  { file: "core-session/I2.session.ts", check: check39 },
  { file: "core-session/I3.session.ts", check: check40 },
  { file: "core-session/O1.session.ts", check: check41 },
  { file: "core-session/O2.session.ts", check: check42 },
  { file: "core-session/O3.session.ts", check: check43 },
  { file: "core-session/O4.session.ts", check: check44 },
  { file: "core-session/P2.session.ts", check: check45 },
  { file: "core-session/T2.session.ts", check: check46 },
  { file: "core-session/T3.session.ts", check: check47 },
];
