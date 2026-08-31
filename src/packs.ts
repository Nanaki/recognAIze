/**
 * Assemblage manuel des checks en 5 packs (DEC-002, amendé par DEC-004 — voir
 * `ADR.md` : DEC-002 nommait 4 packs, `core-declaratif` les rejoint comme
 * 5ᵉ pack).
 *
 * `coreDeclaratif` ci-dessous reste un tableau VIDE : aucun fichier
 * `src/checks/core-declaratif/*.declaratif.ts` n'existe, et
 * `src/referentiel.json` ne déclare aucun `proof_path` de source `DEC`. Le
 * miroir déclaré/observé et les indices négatifs (US-008) sont implémentés
 * comme une logique de RENDU PURE dans `src/report/html.ts`
 * (`renderMirrorSection`), qui lit `ReportExtras.declaratif`
 * (`src/sources/declaratif.ts`) directement — jamais via ce pack ni le
 * pipeline check → Evidence → juge. Le pack existe (satisfait la forme « 5
 * packs » de DEC-002/DEC-004) mais ne contribue aucune Evidence.
 *
 * Ce fichier n'est PAS sous `core/` : il peut donc importer `src/checks/index.ts`
 * (l'index généré par `scripts/gen-checks-index.ts`) sans violer la frontière de
 * `.claude/rules/fiabilite.md` (« core/ n'importe jamais checks/ »). `core/registry.ts`,
 * lui, ne connaît que les tableaux ci-dessous — jamais un fichier de `checks/`
 * directement.
 *
 * Les 5 marches par défaut (`T1/H1/I1/P1/O1`) sont des checks NO-OP — voir
 * leurs docstrings individuelles sous
 * `src/checks/core-git-activity/*.default.ts`. `experimental-llm` reste vide
 * et désactivé — explicitement hors périmètre de ce run.
 */

import type { Check } from "./core/types.js";

import h1Default from "./checks/core-git-activity/H1.default.js";
import i1Default from "./checks/core-git-activity/I1.default.js";
import o1Default from "./checks/core-git-activity/O1.default.js";
import p1Default from "./checks/core-git-activity/P1.default.js";
import t1Default from "./checks/core-git-activity/T1.default.js";

import t2GitActivity from "./checks/core-git-activity/T2.git-activity.js";
import t2PullRequests from "./checks/core-git-activity/T2.pull-requests.js";
import t2Setup from "./checks/core-git-activity/T2.setup.js";
import t3GitActivity from "./checks/core-git-activity/T3.git-activity.js";
import t3PullRequests from "./checks/core-git-activity/T3.pull-requests.js";
import t4GitActivity from "./checks/core-git-activity/T4.git-activity.js";
import h2GitActivity from "./checks/core-git-activity/H2.git-activity.js";
import h3GitActivity from "./checks/core-git-activity/H3.git-activity.js";
import h4GitActivity from "./checks/core-git-activity/H4.git-activity.js";
import h5GitActivity from "./checks/core-git-activity/H5.git-activity.js";
import i2GitActivity from "./checks/core-git-activity/I2.git-activity.js";
import i2Setup from "./checks/core-git-activity/I2.setup.js";
import i3GitActivity from "./checks/core-git-activity/I3.git-activity.js";
import i4GitActivity from "./checks/core-git-activity/I4.git-activity.js";
import i4PullRequests from "./checks/core-git-activity/I4.pull-requests.js";
import i5PullRequests from "./checks/core-git-activity/I5.pull-requests.js";
import p2GitActivity from "./checks/core-git-activity/P2.git-activity.js";
import p3GitActivity from "./checks/core-git-activity/P3.git-activity.js";
import p3PullRequests from "./checks/core-git-activity/P3.pull-requests.js";
import o2GitActivity from "./checks/core-git-activity/O2.git-activity.js";
import o3PullRequests from "./checks/core-git-activity/O3.pull-requests.js";

import h2RepoContext from "./checks/core-repo-context/H2.repo-context.js";
import h3RepoContext from "./checks/core-repo-context/H3.repo-context.js";
import h4RepoContext from "./checks/core-repo-context/H4.repo-context.js";
import h5RepoContext from "./checks/core-repo-context/H5.repo-context.js";
import h6RepoContext from "./checks/core-repo-context/H6.repo-context.js";
import h7RepoContext from "./checks/core-repo-context/H7.repo-context.js";
import o2Sonar from "./checks/core-repo-context/O2.sonar.js";
import o3RepoContext from "./checks/core-repo-context/O3.repo-context.js";
import o4RepoContext from "./checks/core-repo-context/O4.repo-context.js";
import o5RepoContext from "./checks/core-repo-context/O5.repo-context.js";

import h1Session from "./checks/core-session/H1.session.js";
import h6Session from "./checks/core-session/H6.session.js";
import h7Session from "./checks/core-session/H7.session.js";
import i2Session from "./checks/core-session/I2.session.js";
import i3Session from "./checks/core-session/I3.session.js";
import o1Session from "./checks/core-session/O1.session.js";
import o2Session from "./checks/core-session/O2.session.js";
import o3Session from "./checks/core-session/O3.session.js";
import o4Session from "./checks/core-session/O4.session.js";
import p2Session from "./checks/core-session/P2.session.js";
import t2Session from "./checks/core-session/T2.session.js";
import t3Session from "./checks/core-session/T3.session.js";

export const coreGitActivity: readonly Check[] = [
  t1Default,
  h1Default,
  i1Default,
  p1Default,
  o1Default,
  t2GitActivity,
  t2PullRequests,
  t2Setup,
  t3GitActivity,
  t3PullRequests,
  t4GitActivity,
  h2GitActivity,
  h3GitActivity,
  h4GitActivity,
  h5GitActivity,
  i2GitActivity,
  i2Setup,
  i3GitActivity,
  i4GitActivity,
  i4PullRequests,
  i5PullRequests,
  p2GitActivity,
  p3GitActivity,
  p3PullRequests,
  o2GitActivity,
  o3PullRequests,
];
export const coreRepoContext: readonly Check[] = [
  h2RepoContext,
  h3RepoContext,
  h4RepoContext,
  h5RepoContext,
  h6RepoContext,
  h7RepoContext,
  o2Sonar,
  o3RepoContext,
  o4RepoContext,
  o5RepoContext,
];
export const coreSession: readonly Check[] = [
  h1Session,
  h6Session,
  h7Session,
  i2Session,
  i3Session,
  o1Session,
  o2Session,
  o3Session,
  o4Session,
  p2Session,
  t2Session,
  t3Session,
];
export const coreDeclaratif: readonly Check[] = [];
export const experimentalLlm: readonly Check[] = [];

/** Tous les checks activables de ce run (4 packs core), à l'exclusion d'`experimental-llm` — hors périmètre. */
export const CORE_CHECKS: readonly Check[] = [
  ...coreGitActivity,
  ...coreRepoContext,
  ...coreSession,
  ...coreDeclaratif,
];

/**
 * Tous les checks, tous packs confondus (y compris `experimental-llm`) — utilisé
 * uniquement pour la validation d'orphelins de `core/registry.ts` (tout fichier de
 * `src/checks/**` doit appartenir à l'un des 5 tableaux, même si son pack reste
 * désactivé dans ce run).
 */
export const ALL_CHECKS: readonly Check[] = [...CORE_CHECKS, ...experimentalLlm];
