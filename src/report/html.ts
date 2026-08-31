/**
 * `report.html` : fiche complète — titre honnête selon la largeur de
 * fourchette, marche bloquante et raison chiffrée par axe, cartes des 24
 * marches (état, chemins de preuve et leur statut, valeur observée à côté du
 * seuil, Evidence citées, lien de fiche), section « ce qui manque pour
 * trancher », miroir déclaré/observé, badge qualité, incohérences,
 * avertissements et pied de page versionné.
 *
 * Autonome par construction : aucune ressource externe (polices système,
 * aucune image, aucun `http(s)://`), tout contenu de profil passe par
 * `esc()` (`src/report/esc.ts`) avant interpolation — jamais d'interpolation
 * directe d'une chaîne recopiée du profil ou du référentiel.
 *
 * Cette fonction reste PURE (aucune E/S) et prend en paramètres, en plus du
 * `ResultDocument` (`src/report/json.ts`) :
 * - le `Referentiel` déjà chargé par `src/analyze.ts` (`AnalysisOutcome.referentiel`)
 *   — jamais un second `loadReferentiel()` ici, pour ne pas dupliquer la
 *   lecture disque ni risquer une désynchronisation avec `referentiel_hash` ;
 *   nécessaire pour les libellés de marche, les chemins de preuve et les
 *   contre-preuves, qu'`Evidence`/`Verdict` seuls ne portent pas ;
 * - {@link ReportExtras}, un sous-ensemble ÉTROIT de `ProfileContext`
 *   (`declaratif`, `gitActivity`, `sonarMeasures` seulement) — nécessaire au
 *   miroir déclaré/observé (texte libre du déclaratif : jamais sérialisé dans
 *   `result.json`, donc absent de `ResultDocument`) et au badge qualité
 *   (`lib/quality-badge.ts`, qui a besoin des mesures Sonar et des compteurs
 *   CI/couverture bruts). Alternative rejetée : élargir
 *   `ResultDocument`/`result.json` pour y loger le déclaratif — le schéma de
 *   `result.json` (`RESULT_SCHEMA_VERSION`) est déjà prouvé par des golden
 *   files committés ; le miroir est un besoin de RENDU HTML uniquement,
 *   jamais une sortie structurée à figer. `ReportExtras` reste volontairement
 *   plus étroit que `ProfileContext` entier : pas de dépendance à
 *   `profile`/`pullRequests`/`repoContext`/`session`, non utilisés ici.
 *
 * `renderConceptLink` rend un vrai lien vers la fiche d'une marche — chemin
 * RELATIF (jamais `http(s)://`, contrainte dure de ce fichier), et TOUJOURS
 * une ancre SUR LA MÊME PAGE (`#concept-<marche>`, ex. `#concept-h4`), jamais
 * un chemin vers `docs/referentiel.md` : `report.html` est écrit sous
 * `recognaize-cli-out/<sujet>/`, où `docs/` n'existe jamais (jamais copié) —
 * un lien relatif vers ce fichier serait donc toujours mort. Le contenu du
 * référentiel est à la place rendu INLINE dans une annexe de ce même document
 * ({@link renderConceptAnnex}), ce qui garantit que le lien résout toujours,
 * quel que soit le dossier de sortie. `ConceptsIndex` (`src/report/next-step.ts`)
 * est un paramètre optionnel de {@link buildReportHtml} — absent (`undefined`)
 * ⇒ repli sur un texte « Fiche : indisponible », jamais un lien cassé, pour
 * rester robuste si `concepts.json` devient un jour indisponible sans faire
 * tomber tout le rendu HTML.
 */

import type { AxisJudgement, OwnershipJudgement } from "../core/judge.js";
import type { Referentiel } from "../core/referentiel.js";
import type { AxeId, Etat, Evidence, Fourchette, Rang, SourceId, Verdict } from "../core/types.js";
import { RANGS_ORDONNES } from "../core/types.js";
import { computeQualityBadge, type QualityBadge } from "../lib/quality-badge.js";
import type { DeclaratifData } from "../sources/declaratif.js";
import type { GitActivityData } from "../sources/git-activity.js";
import type { SonarData } from "../sources/sonar.js";
import { atomicWriteFileSync } from "./atomic-write.js";
import { renderConceptDetailHtml } from "./concept-markdown.js";
import { esc } from "./esc.js";
import type { ResultDocument } from "./json.js";
import { computeNextStep, type ConceptsIndex, type NextStep, type NextStepKind } from "./next-step.js";

/** Sous-ensemble étroit de `ProfileContext` — voir l'en-tête de ce fichier. */
export interface ReportExtras {
  readonly declaratif?: DeclaratifData;
  readonly gitActivity?: GitActivityData;
  readonly sonarMeasures?: SonarData;
}

const OFFICIAL_AXES: readonly AxeId[] = ["T", "H", "I", "P"];

/**
 * Fichier de profil source d'une `Evidence`, pour l'affichage humain — même
 * vocabulaire que `PIECE_LABELS` (`src/cli.ts`). Exportée pour réutilisation
 * par `src/report/explain.ts` (`checks explain`) — au lieu d'une seconde
 * table dupliquée.
 */
export const SOURCE_FILE_LABELS: Readonly<Record<string, string>> = {
  GA: "git-activity.json",
  PR: "pull-requests.json",
  RC: "repo-context/",
  S: "session.md",
  SO: "sonar-measures.json",
  SU: "repo-context/ (contenu skill/agent)",
  DEC: "declaratif.md",
};

/** Encart latéral gauche, sticky, identique quel que soit l'axe sélectionné. Ordre du
    tableau ci-dessous purement déclaratif ; l'ordre RÉELLEMENT affiché vient de `confiance_source` (référentiel),
    trié en {@link renderGlossarySidebar} — jamais de doublon de ce classement en dur ici (DEC-001). */
const SOURCE_GLOSSARY: readonly { readonly code: SourceId; readonly file: string; readonly description: string }[] = [
  { code: "GA", file: "git-activity.json", description: "Statistiques agrégées de l'activité Git : tailles de PR, corrections après ouverture, parallélisme des branches." },
  { code: "RC", file: "repo-context/", description: "Inventaire du harnais IA du dépôt (identité, mémoire, règles, agents, guardrails…) — classé par nom/emplacement, jamais par lecture de contenu." },
  { code: "PR", file: "pull-requests.json", description: "Détail des pull requests : tailles, délais d'ouverture à fusion, corps de texte." },
  { code: "SO", file: "sonar-measures.json", description: "Mesures de qualité de code — informatif seulement, ne plafonne jamais le rang." },
  { code: "S", file: "session.md", description: "Résumé d'une session de travail avec l'IA." },
  { code: "SU", file: "repo-context/ (contenu skill/agent)", description: "Lecture du CONTENU d'un skill/agent déclaré — indice faible, jamais une preuve seule." },
  { code: "DEC", file: "declaratif.md", description: "Ce que la personne dit d'elle-même — jamais une preuve, seulement un miroir déclaré/observé." },
];

const FORCE_GLOSSARY: readonly { readonly code: string; readonly description: string }[] = [
  { code: "prouve", description: "Trace récurrente — peut suffire seule à faire passer une marche à « prouvé »." },
  { code: "indice", description: "Observation isolée — jamais suffisante seule, vient en appui d'une preuve." },
];

/** Trie par `confiance_source` décroissante (référentiel — jamais un ordre en dur ici, DEC-001) ; à confiance
    égale, ordre stable = celui déclaré dans {@link SOURCE_GLOSSARY}. */
function renderGlossarySidebar(confianceSource: Referentiel["confiance_source"]): string {
  const sorted = [...SOURCE_GLOSSARY].sort((a, b) => confianceSource[b.code] - confianceSource[a.code]);
  const sourceRows = sorted
    .map(
      (entry) =>
        `<li><code>${esc(entry.code)}</code> — <strong>${esc(entry.file)}</strong><p>${esc(entry.description)}</p></li>`,
    )
    .join("\n");
  return `<aside class="glossary-sidebar" aria-label="Sources de données, classées par ordre de précédence">
  <h2>Sources de données</h2>
  <p class="glossary-precedence-note">Classées ci-dessous par ordre de précédence : la source la plus fiable en premier.</p>
  <ul class="glossary-list">
${sourceRows}
  </ul>
</aside>`;
}

/** Encart séparé de `glossary-sidebar` : les 2 encarts gauche restent 2 cases indépendantes, empilées dans `.sidebar-stack` (voir `buildReportHtml`) et repliables ENSEMBLE via une seule case à cocher CSS. */
function renderForceGlossarySidebar(): string {
  const forceRows = FORCE_GLOSSARY.map(
    (entry) => `<li><code>${esc(entry.code)}</code><p>${esc(entry.description)}</p></li>`,
  ).join("\n");
  return `<aside class="force-glossary-sidebar" aria-label="Force d'une preuve">
  <h2>Force d'une preuve</h2>
  <ul class="glossary-list">
${forceRows}
  </ul>
</aside>`;
}

const ETAT_LABELS: Readonly<Record<Etat, string>> = {
  prouvé: "prouvé",
  indice: "indice",
  déclaré: "déclaré",
  inconnu: "inconnu",
  infirmé: "infirmé",
  compris: "compris",
};

/** Classe CSS ASCII par état — les libellés eux-mêmes restent accentués (affichage), la classe reste stable. */
const ETAT_CLASS: Readonly<Record<Etat, string>> = {
  prouvé: "etat-prouve",
  indice: "etat-indice",
  déclaré: "etat-declare",
  inconnu: "etat-inconnu",
  infirmé: "etat-infirme",
  compris: "etat-compris",
};

const QUALITY_BADGE_LABELS: Readonly<Record<QualityBadge, string>> = {
  vert: "Vert",
  orange: "Orange",
  rouge: "Rouge",
  non_evalue: "Non évalué",
};

const QUALITY_BADGE_CLASS: Readonly<Record<QualityBadge, string>> = {
  vert: "badge-vert",
  orange: "badge-orange",
  rouge: "badge-rouge",
  non_evalue: "badge-non-evalue",
};

// ---------------------------------------------------------------------------
// Petits utilitaires de formatage — jamais de `undefined`/`null`/`NaN` visible
// ---------------------------------------------------------------------------

/** Chaîne non vide, échappée, ou repli échappé — jamais d'interpolation directe d'une valeur potentiellement absente. */
function fmtText(value: string | null | undefined, fallback: string): string {
  if (value === null || value === undefined || value.length === 0) return esc(fallback);
  return esc(value);
}

/** Nombre fini échappé, ou repli — filet de sécurité : `round2` (`core/judge.ts`) garantit déjà l'absence de `NaN`/`Infinity` ici, ce repli ne devrait jamais s'activer en pratique. */
function fmtNumber(value: number, fallback = "non disponible"): string {
  if (!Number.isFinite(value)) return esc(fallback);
  return esc(String(value));
}

function fmtRang(rang: Rang | null): string {
  return fmtText(rang, "indéterminé");
}

// ---------------------------------------------------------------------------
// Titre honnête selon la largeur de fourchette
// ---------------------------------------------------------------------------

function fourchetteWidth(fourchette: Fourchette): number {
  const basIndex = RANGS_ORDONNES.indexOf(fourchette.bas);
  const hautIndex = RANGS_ORDONNES.indexOf(fourchette.haut);
  return Math.max(0, hautIndex - basIndex);
}

function describeBlockingCauses(verdicts: readonly Verdict[]): string {
  const causes = verdicts
    .filter((verdict) => verdict.marche_bloquante !== undefined)
    .map((verdict) => `axe ${esc(verdict.axe)} — ${esc(verdict.marche_bloquante ?? "")} : ${esc(verdict.raison)}`);
  if (causes.length === 0) {
    return "Toutes les marches connues des 4 axes officiels sont atteintes.";
  }
  return causes.join(" · ");
}

interface TitleBlock {
  readonly title: string;
  readonly subtitle: string;
}

/**
 * Tâche 1 : largeur ≤ 1 ⇒ le rang affiché est le titre ; largeur 2 ⇒ la
 * fourchette est le titre, le point bas et sa cause en sous-titre ; largeur
 * ≥ 3 ⇒ « indéterminé », fourchette en sous-titre (couvre aussi le statut
 * `"indeterminate"` du juge, dont la fourchette White–Gold a toujours une
 * largeur de 6 — aucun cas particulier n'est nécessaire).
 */
function buildTitleBlock(document: ResultDocument): TitleBlock {
  const width = fourchetteWidth(document.fourchette);
  const bas = fmtRang(document.fourchette.bas);
  const haut = fmtRang(document.fourchette.haut);

  if (width <= 1) {
    return { title: fmtRang(document.rang_affiche), subtitle: `Fourchette : ${bas} – ${haut}` };
  }
  if (width === 2) {
    const cause = describeBlockingCauses(document.verdicts);
    return {
      title: `${bas} – ${haut}`,
      subtitle: `Point bas : ${bas}. Ce qui bloque la suite : ${cause}`,
    };
  }
  return { title: "Indéterminé", subtitle: `Fourchette : ${bas} – ${haut}` };
}

// ---------------------------------------------------------------------------
// Référentiel : index marche -> axe/label, pour les cartes de marches
// ---------------------------------------------------------------------------

interface MarcheEntry {
  readonly axisId: AxeId;
  readonly axisLabel: string;
  readonly id: string;
  readonly label: string;
  readonly proofPaths: readonly Referentiel["axes"][number]["marches"][number]["proof_paths"][number][];
  readonly counterProof: Referentiel["axes"][number]["marches"][number]["counter_proof"];
}

function indexReferentiel(referentiel: Referentiel): ReadonlyMap<string, MarcheEntry> {
  const index = new Map<string, MarcheEntry>();
  for (const axis of referentiel.axes) {
    for (const marche of axis.marches) {
      index.set(marche.id, {
        axisId: axis.id,
        axisLabel: axis.label,
        id: marche.id,
        label: marche.label,
        proofPaths: marche.proof_paths,
        counterProof: marche.counter_proof,
      });
    }
  }
  return index;
}

/** `Evidence[]` regroupées par `path_id` — un chemin de preuve peut avoir 0, 1 ou plusieurs `Evidence` (sources multiples, contre-preuve). */
function indexEvidenceByPathId(evidence: readonly Evidence[]): ReadonlyMap<string, readonly Evidence[]> {
  const index = new Map<string, Evidence[]>();
  for (const item of evidence) {
    const list = index.get(item.path_id) ?? [];
    list.push(item);
    index.set(item.path_id, list);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Carte de marche
// ---------------------------------------------------------------------------

/**
 * Lien de fiche concept : ancre SUR LA MÊME PAGE (`concept.lien`, ex.
 * `#concept-h4`) vers la section correspondante de {@link renderConceptAnnex},
 * quand `concepts` est fourni et connaît cette marche ; repli textuel sinon
 * (jamais un `<a href>` cassé ou vide).
 */
function renderConceptLink(marcheId: string, concepts: ConceptsIndex | undefined): string {
  const concept = concepts?.get(marcheId);
  if (!concept) {
    return `<span class="concept-pending">Fiche : indisponible pour « ${esc(marcheId)} ».</span>`;
  }
  return `<a class="concept-link" href="${esc(concept.lien)}">Fiche : ${esc(concept.description)}</a>`;
}

function renderProofPathRow(
  proofPath: MarcheEntry["proofPaths"][number],
  evidenceByPathId: ReadonlyMap<string, readonly Evidence[]>,
): string {
  const matches = evidenceByPathId.get(proofPath.path_id) ?? [];

  if (matches.length === 0) {
    return `<li class="proof-path proof-path--absent">
  <span class="path-id">${esc(proofPath.path_id)}</span>
  <span class="evidence-icon evidence-icon--absent" aria-hidden="true"></span>
  <span class="path-status">non observé</span>
  <p class="path-desc">${esc(proofPath.description)} (${esc(proofPath.source)}, signal <code>${esc(proofPath.signal_id)}</code>, force ${esc(proofPath.force)})</p>
</li>`;
  }

  const evidenceItems = matches
    .map((item) => {
      const polariteLabel = item.polarite === "preuve" ? "preuve" : "contre-preuve";
      const citation = fmtText(item.citation, "aucune raison chiffrée fournie par le check.");
      return `<li class="evidence-item evidence-item--${esc(item.polarite)}">
    <span class="evidence-icon evidence-icon--${esc(item.polarite)}" aria-hidden="true"></span>
    <span class="evidence-source">${esc(item.source)}</span>
    <span class="evidence-polarite">${esc(polariteLabel)}</span>
    <code class="evidence-citation">${citation}</code>
  </li>`;
    })
    .join("\n");

  return `<li class="proof-path proof-path--observe">
  <span class="path-id">${esc(proofPath.path_id)}</span>
  <span class="path-status">observé</span>
  <p class="path-desc">${esc(proofPath.description)} (${esc(proofPath.source)}, signal <code>${esc(proofPath.signal_id)}</code>, force ${esc(proofPath.force)})</p>
  <ul class="evidence-list">
${evidenceItems}
  </ul>
</li>`;
}

function renderMarcheCard(
  marche: MarcheEntry,
  etat: Etat,
  evidenceByPathId: ReadonlyMap<string, readonly Evidence[]>,
  concepts: ConceptsIndex | undefined,
): string {
  const etatLabel = ETAT_LABELS[etat] ?? etat;
  const etatClass = ETAT_CLASS[etat] ?? "etat-inconnu";

  const proofPathsHtml =
    marche.proofPaths.length === 0
      ? `<p class="no-proof-path">Marche par défaut : aucun chemin de preuve — prouvée dès qu'une preuve d'usage de l'IA existe ailleurs dans le profil.</p>`
      : `<ul class="proof-paths">\n${marche.proofPaths.map((proofPath) => renderProofPathRow(proofPath, evidenceByPathId)).join("\n")}\n</ul>`;

  const counterProofHtml =
    marche.counterProof === null
      ? ""
      : `<p class="counter-proof">Contre-preuve définie : ${esc(marche.counterProof.description)}</p>`;

  return `<article class="marche-card ${etatClass}" id="marche-${esc(marche.id)}">
  <header class="marche-card__header">
    <h4>${esc(marche.id)} — ${esc(marche.label)}</h4>
    <span class="pill ${etatClass}">${esc(etatLabel)}</span>
  </header>
  ${proofPathsHtml}
  ${counterProofHtml}
  <footer class="marche-card__footer">${renderConceptLink(marche.id, concepts)}</footer>
</article>`;
}

function renderMarcheCards(
  marcheIds: readonly string[],
  etatByMarche: ReadonlyMap<string, Etat>,
  referentielIndex: ReadonlyMap<string, MarcheEntry>,
  evidenceByPathId: ReadonlyMap<string, readonly Evidence[]>,
  concepts: ConceptsIndex | undefined,
): string {
  return marcheIds
    .map((marcheId) => {
      const marche = referentielIndex.get(marcheId);
      if (!marche) return "";
      const etat = etatByMarche.get(marcheId) ?? "inconnu";
      return renderMarcheCard(marche, etat, evidenceByPathId, concepts);
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Prochaine marche par axe
// ---------------------------------------------------------------------------

const NEXT_STEP_LABELS: Readonly<Record<NextStepKind, string>> = {
  "prochaine-marche": "Prochaine marche",
  sommet: "Au sommet de cet axe",
  indetermine: "Indéterminé",
};

function renderNextStepBlock(nextStep: NextStep): string {
  if (nextStep.kind === "sommet") {
    return `<div class="next-step next-step--sommet">
  <h4>${esc(NEXT_STEP_LABELS.sommet)}</h4>
  <p>Toutes les marches connues de cet axe sont à l'état prouvé — rien de plus à apporter ici pour l'instant.</p>
</div>`;
  }
  if (nextStep.kind === "indetermine") {
    return `<div class="next-step next-step--indetermine">
  <h4>${esc(NEXT_STEP_LABELS.indetermine)}</h4>
  <p>Statut indéterminé : aucune preuve d'usage de l'IA détectée dans le profil, aucune marche n'a été jugée.</p>
</div>`;
  }

  const marcheId = nextStep.marche ?? "?";
  const etatLabel = nextStep.etat !== undefined ? (ETAT_LABELS[nextStep.etat] ?? nextStep.etat) : "inconnu";
  const descriptionHtml =
    nextStep.description !== undefined
      ? `<p class="next-step__description">${esc(nextStep.description)}</p>`
      : `<p class="next-step__description">Aucune description disponible (« ${esc(marcheId)} » absente de concepts.json).</p>`;
  const lienHtml =
    nextStep.lien !== undefined ? `<a class="concept-link" href="${esc(nextStep.lien)}">Fiche</a>` : "";
  const manqueHtml =
    nextStep.manque.length === 0
      ? `<p class="next-step__manque">Marche par défaut : aucun chemin de preuve requis.</p>`
      : `<ul class="next-step__manque">\n${nextStep.manque
          .map(
            (item) =>
              `  <li>${esc(item.source)} (signal <code>${esc(item.signal_id)}</code>) — ${esc(item.description)}</li>`,
          )
          .join("\n")}\n</ul>`;

  return `<div class="next-step">
  <h4>${esc(NEXT_STEP_LABELS["prochaine-marche"])} : ${esc(marcheId)}${nextStep.label !== undefined ? ` — ${esc(nextStep.label)}` : ""} <span class="pill ${esc(ETAT_CLASS[nextStep.etat ?? "inconnu"] ?? "etat-inconnu")}">${esc(etatLabel)}</span></h4>
  ${descriptionHtml}
  <p class="next-step__manque-title">Ce qui manque :</p>
  ${manqueHtml}
  ${lienHtml}
</div>`;
}

// ---------------------------------------------------------------------------
// Section par axe (marche bloquante + raison chiffrée)
// ---------------------------------------------------------------------------

/**
 * Phrase en clair par axe (divulgation progressive) — code ET libellé
 * toujours accolés (`T2 — feature M`, jamais un code nu), avant tout détail
 * technique. Réutilise `referentielIndex` pour le libellé — aucun contenu
 * nouveau, seulement une reformulation de données déjà présentes.
 */
function renderAxisPlainSentence(
  axeCode: string,
  axisLabel: string,
  niveauPonctuel: string | null,
  marcheBloquante: string | undefined,
  referentielIndex: ReadonlyMap<string, MarcheEntry>,
): string {
  const currentLabel = niveauPonctuel !== null ? referentielIndex.get(niveauPonctuel)?.label : undefined;
  const currentText =
    niveauPonctuel !== null
      ? `atteint ${esc(niveauPonctuel)}${currentLabel !== undefined ? ` — ${esc(currentLabel)}` : ""}`
      : "aucune marche prouvée pour l'instant";
  const blockingLabel = marcheBloquante !== undefined ? referentielIndex.get(marcheBloquante)?.label : undefined;
  const blockingText =
    marcheBloquante !== undefined
      ? `, bloqué par ${esc(marcheBloquante)}${blockingLabel !== undefined ? ` — ${esc(blockingLabel)}` : ""}`
      : "";
  return `<p class="axis-plain-sentence"><strong>${esc(axisLabel)} (${esc(axeCode)})</strong> : ${currentText}${blockingText}.</p>`;
}

function renderAxisSection(
  axisJudgement: AxisJudgement,
  verdict: Verdict,
  axisLabel: string,
  axis: Referentiel["axes"][number],
  referentielIndex: ReadonlyMap<string, MarcheEntry>,
  evidenceByPathId: ReadonlyMap<string, readonly Evidence[]>,
  concepts: ConceptsIndex | undefined,
): string {
  const etatByMarche = new Map(axisJudgement.etats.map((entry) => [entry.marche, entry.etat]));
  const marcheIds = axisJudgement.etats.map((entry) => entry.marche);

  const blockingLabel =
    verdict.marche_bloquante !== undefined ? referentielIndex.get(verdict.marche_bloquante)?.label : undefined;
  const blocking =
    verdict.marche_bloquante === undefined
      ? `<p class="axis-blocking axis-blocking--none">Aucune marche bloquante : ${esc(verdict.raison)}</p>`
      : `<p class="axis-blocking"><strong>Marche bloquante : ${esc(verdict.marche_bloquante)}${blockingLabel !== undefined ? ` — ${esc(blockingLabel)}` : ""}</strong><br>Raison chiffrée : ${esc(verdict.raison)}</p>`;

  const nextStep = computeNextStep(verdict.axe, axis, axisJudgement.etats, concepts ?? new Map());
  const plainSentence = renderAxisPlainSentence(
    verdict.axe,
    axisLabel,
    axisJudgement.niveau_ponctuel,
    verdict.marche_bloquante,
    referentielIndex,
  );

  return `<section class="axis-section" id="axe-${esc(verdict.axe)}">
  <h3>${esc(axisLabel)} (${esc(verdict.axe)})</h3>
  ${plainSentence}
  <details class="axis-detail">
    <summary>Détail technique</summary>
    <dl class="axis-stats">
      <dt>Niveau prouvé</dt><dd>${fmtText(axisJudgement.niveau_prouve, "aucun")}</dd>
      <dt>Niveau ponctuel</dt><dd>${fmtText(axisJudgement.niveau_ponctuel, "aucun")}</dd>
      <dt>Plafond potentiel</dt><dd>${fmtText(axisJudgement.plafond_potentiel, "aucun")}</dd>
      <dt>Couverture</dt><dd>${fmtNumber(axisJudgement.couverture)}</dd>
      <dt>Accord</dt><dd>${fmtNumber(axisJudgement.accord)}</dd>
      <dt>Confiance</dt><dd>${fmtNumber(axisJudgement.confiance)}</dd>
    </dl>
    ${blocking}
    ${renderNextStepBlock(nextStep)}
    <div class="marche-cards">
${renderMarcheCards(marcheIds, etatByMarche, referentielIndex, evidenceByPathId, concepts)}
    </div>
  </details>
</section>`;
}

function renderOwnershipSection(
  ownership: OwnershipJudgement,
  referentielIndex: ReadonlyMap<string, MarcheEntry>,
  evidenceByPathId: ReadonlyMap<string, readonly Evidence[]>,
  concepts: ConceptsIndex | undefined,
): string {
  const etatByMarche = new Map(ownership.etats.map((entry) => [entry.marche, entry.etat]));
  const marcheIds = ownership.etats.map((entry) => entry.marche);
  const mention =
    ownership.rabais_applique && ownership.mention !== undefined
      ? `<p class="ownership-mention">${esc(ownership.mention)}</p>`
      : `<p class="ownership-mention ownership-mention--none">Aucun rabais Ownership appliqué au rang affiché.</p>`;
  const plainSentence = renderAxisPlainSentence("O", "Ownership", ownership.niveau_ponctuel, undefined, referentielIndex);

  return `<section class="axis-section" id="axe-O">
  <h3>Ownership (O) — affiché, hors ligne de montée</h3>
  ${plainSentence}
  <details class="axis-detail">
    <summary>Détail technique</summary>
    <dl class="axis-stats">
      <dt>Niveau prouvé</dt><dd>${fmtText(ownership.niveau_prouve, "aucun")}</dd>
      <dt>Niveau ponctuel</dt><dd>${fmtText(ownership.niveau_ponctuel, "aucun")}</dd>
    </dl>
    ${mention}
    <div class="marche-cards">
${renderMarcheCards(marcheIds, etatByMarche, referentielIndex, evidenceByPathId, concepts)}
    </div>
  </details>
</section>`;
}

// ---------------------------------------------------------------------------
// Coup d'œil (radar 5 axes + résumé en clair, divulgation progressive)
// ---------------------------------------------------------------------------

interface RadarPoint {
  readonly code: string;
  readonly label: string;
  readonly currentCode: string;
  readonly progress: number;
}

/** Position 0..1 sur l'échelle PROPRE à l'axe (index de la marche ponctuelle / nombre de marches de cet axe) — jamais une échelle commune entre axes de longueurs différentes (T a 4 marches, H en a 7). */
function axisProgress(niveauPonctuel: string | null, marcheIds: readonly string[]): number {
  if (niveauPonctuel === null || marcheIds.length === 0) return 0;
  const index = marcheIds.indexOf(niveauPonctuel);
  if (index === -1) return 0;
  return (index + 1) / marcheIds.length;
}

/** Radar SVG inline — aucune librairie externe (contrainte dure : `report.html` autonome, ouvrable en `file://`). */
function renderRadarChart(points: readonly RadarPoint[]): string {
  const size = 340;
  const center = size / 2;
  const maxRadius = 90;
  const labelRadius = 115;
  const n = points.length;
  const angleFor = (i: number): number => ((-90 + (360 / n) * i) * Math.PI) / 180;

  const ringPolygons = [0.25, 0.5, 0.75, 1]
    .map((frac) => {
      const pts = points
        .map((_, i) => {
          const a = angleFor(i);
          const r = maxRadius * frac;
          return `${(center + r * Math.cos(a)).toFixed(1)},${(center + r * Math.sin(a)).toFixed(1)}`;
        })
        .join(" ");
      return `<polygon points="${pts}" class="radar-grid" />`;
    })
    .join("\n    ");

  const spokes = points
    .map((_, i) => {
      const a = angleFor(i);
      const x = (center + maxRadius * Math.cos(a)).toFixed(1);
      const y = (center + maxRadius * Math.sin(a)).toFixed(1);
      return `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" class="radar-spoke" />`;
    })
    .join("\n    ");

  const shapePoints = points
    .map((p, i) => {
      const a = angleFor(i);
      const r = maxRadius * p.progress;
      return `${(center + r * Math.cos(a)).toFixed(1)},${(center + r * Math.sin(a)).toFixed(1)}`;
    })
    .join(" ");

  const dots = points
    .map((p, i) => {
      const a = angleFor(i);
      const r = maxRadius * p.progress;
      const x = (center + r * Math.cos(a)).toFixed(1);
      const y = (center + r * Math.sin(a)).toFixed(1);
      return `<circle cx="${x}" cy="${y}" r="3.5" class="radar-dot" />`;
    })
    .join("\n    ");

  const labels = points
    .map((p, i) => {
      const a = angleFor(i);
      const x = (center + labelRadius * Math.cos(a)).toFixed(1);
      const y = (center + labelRadius * Math.sin(a)).toFixed(1);
      const cos = Math.cos(a);
      const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="radar-label">${esc(p.code)} — ${esc(p.currentCode)}</text>`;
    })
    .join("\n    ");

  const ariaLabel = points.map((p) => `${p.label} ${p.currentCode}`).join(", ");

  return `<figure class="radar-figure">
  <svg class="radar-chart" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(`Position sur chaque axe : ${ariaLabel}`)}">
    ${ringPolygons}
    ${spokes}
    <polygon points="${shapePoints}" class="radar-shape" />
    ${dots}
    ${labels}
  </svg>
  <figcaption>Chaque sommet = position sur l'échelle propre à son axe (centre = rien de prouvé, bord = sommet de l'axe atteint).</figcaption>
</figure>`;
}

function renderGlanceSection(
  document: ResultDocument,
  referentiel: Referentiel,
  referentielIndex: ReadonlyMap<string, MarcheEntry>,
  axisLabels: ReadonlyMap<string, string>,
): string {
  const axisById = new Map(referentiel.axes.map((axis) => [axis.id, axis]));
  const verdictByAxe = new Map(document.verdicts.map((verdict) => [verdict.axe, verdict]));

  const radarPoints: RadarPoint[] = OFFICIAL_AXES.map((axeId) => {
    const axisJudgement = document.axes.find((entry) => entry.axe === axeId);
    const axis = axisById.get(axeId);
    const marcheIds = axis?.marches.map((marche) => marche.id) ?? [];
    const niveauPonctuel = axisJudgement?.niveau_ponctuel ?? null;
    return {
      code: axeId,
      label: axisLabels.get(axeId) ?? axeId,
      currentCode: niveauPonctuel ?? "—",
      progress: axisProgress(niveauPonctuel, marcheIds),
    };
  });
  const ownershipMarcheIds = [...referentiel.ownership.marches];
  radarPoints.push({
    code: "O",
    label: "Ownership",
    currentCode: document.ownership.niveau_ponctuel ?? "—",
    progress: axisProgress(document.ownership.niveau_ponctuel, ownershipMarcheIds),
  });

  // Axe le plus faible parmi les 4 axes officiels de la ligne de montée — Ownership exclu (non bloquant, DEC-003).
  const officialPoints = radarPoints.slice(0, OFFICIAL_AXES.length);
  const weakest = officialPoints.reduce((min, point) => (point.progress < min.progress ? point : min), officialPoints[0]!);
  const weakestVerdict = verdictByAxe.get(weakest.code as AxeId);
  const weakestBlocking = weakestVerdict?.marche_bloquante;
  const weakestBlockingLabel = weakestBlocking !== undefined ? referentielIndex.get(weakestBlocking)?.label : undefined;
  const weakestClause =
    weakestBlocking !== undefined
      ? `, bloqué par ${esc(weakestBlocking)}${weakestBlockingLabel !== undefined ? ` — ${esc(weakestBlockingLabel)}` : ""}`
      : "";

  const globalParagraph = `<p class="glance-summary">Rang affiché : <strong>${fmtRang(document.rang_affiche)}</strong> (fourchette ${fmtRang(document.fourchette.bas)} – ${fmtRang(document.fourchette.haut)}). L'axe le plus en retard est <strong>${esc(weakest.label)} (${esc(weakest.code)})</strong>${weakestClause}. Détail par axe ci-dessous — dépliez « Détail technique » pour les preuves chiffrées.</p>`;

  return `<section class="glance-section" aria-label="Coup d'œil">
  <h2>Coup d'œil</h2>
  ${globalParagraph}
  ${renderRadarChart(radarPoints)}
</section>`;
}

// ---------------------------------------------------------------------------
// « Ce qui manque pour trancher »
// ---------------------------------------------------------------------------

function renderMissingForAxis(axisLabel: string, axisId: string, marcheIds: readonly string[], etatByMarche: ReadonlyMap<string, Etat>, referentielIndex: ReadonlyMap<string, MarcheEntry>): string {
  const unknownMarches = marcheIds.filter((marcheId) => etatByMarche.get(marcheId) === "inconnu");
  if (unknownMarches.length === 0) return "";

  const items = unknownMarches
    .map((marcheId) => {
      const marche = referentielIndex.get(marcheId);
      if (!marche || marche.proofPaths.length === 0) {
        return `<li>${esc(marcheId)} : marche inconnue, aucun chemin de preuve déclaré.</li>`;
      }
      const pieces = marche.proofPaths
        .map((proofPath) => `${esc(proofPath.source)} (signal <code>${esc(proofPath.signal_id)}</code>) — ${esc(proofPath.description)}`)
        .join(" ; ");
      return `<li>${esc(marcheId)} — ${esc(marche.label)} : ${pieces}</li>`;
    })
    .join("\n");

  return `<div class="missing-axis">
  <h4>${esc(axisLabel)} (${esc(axisId)})</h4>
  <ul>
${items}
  </ul>
</div>`;
}

function renderMissingSection(
  document: ResultDocument,
  ownership: OwnershipJudgement,
  referentielIndex: ReadonlyMap<string, MarcheEntry>,
  axisLabels: ReadonlyMap<string, string>,
): string {
  // Cas traité à part, avant toute autre logique : sur un profil
  // `status === "indeterminate"` (aucune preuve d'usage de l'IA nulle part,
  // `core/judge.ts`.`indeterminateResult`), CHAQUE axe a `etats: []` — aucune
  // marche n'est jugée du tout, il n'y a AUCUNE Evidence. Sans ce cas
  // particulier, `blocks` resterait vide (rien à lister, faute de marche à
  // lister) et tomberait dans la même branche que « tout est prouvé »,
  // affichant « Aucune marche inconnue : chaque marche (…) dispose d'au moins
  // une preuve » — affirmation directement contredite par le statut
  // indéterminé et les 0 carte de marche affichées ailleurs dans la page.
  if (document.status === "indeterminate") {
    return `<section class="missing-section">
  <h2>Ce qui manque pour trancher</h2>
  <p>Statut indéterminé : aucune preuve d'usage de l'IA n'a été trouvée dans ce profil, quelle que soit la pièce. Aucune marche n'a pu être jugée — ce n'est pas « toutes les marches sont prouvées », c'est qu'aucune n'a même été évaluée.</p>
</section>`;
  }

  const blocks: string[] = [];
  for (const axisJudgement of document.axes) {
    const etatByMarche = new Map(axisJudgement.etats.map((entry) => [entry.marche, entry.etat]));
    const marcheIds = axisJudgement.etats.map((entry) => entry.marche);
    const label = axisLabels.get(axisJudgement.axe) ?? axisJudgement.axe;
    const block = renderMissingForAxis(label, axisJudgement.axe, marcheIds, etatByMarche, referentielIndex);
    if (block.length > 0) blocks.push(block);
  }
  const ownershipEtatByMarche = new Map(ownership.etats.map((entry) => [entry.marche, entry.etat]));
  const ownershipMarcheIds = ownership.etats.map((entry) => entry.marche);
  const ownershipBlock = renderMissingForAxis("Ownership", "O", ownershipMarcheIds, ownershipEtatByMarche, referentielIndex);
  if (ownershipBlock.length > 0) blocks.push(ownershipBlock);

  const body =
    blocks.length === 0
      ? `<p>Aucune marche inconnue : chaque marche de chaque axe dispose d'au moins une preuve, un indice ou une contre-preuve.</p>`
      : blocks.join("\n");

  return `<section class="missing-section">
  <h2>Ce qui manque pour trancher</h2>
  ${body}
</section>`;
}

// ---------------------------------------------------------------------------
// Miroir déclaré/observé
// ---------------------------------------------------------------------------

function renderMirrorSection(declaratif: DeclaratifData | undefined, document: ResultDocument): string {
  if (declaratif === undefined) {
    return `<section class="mirror-section">
  <h2>Miroir : déclaré vs observé</h2>
  <p>Aucun déclaratif disponible pour ce profil (fichier absent) — rien à comparer.</p>
</section>`;
  }
  if (!declaratif.answered) {
    return `<section class="mirror-section">
  <h2>Miroir : déclaré vs observé</h2>
  <p>Déclaratif présent mais sans réponse exploitable — « non renseigné ».</p>
</section>`;
  }

  const observedSummary = `rang affiché ${fmtRang(document.rang_affiche)}, fourchette ${fmtRang(document.fourchette.bas)} – ${fmtRang(document.fourchette.haut)}, confiance ${fmtNumber(document.confiance_globale)}.`;

  const selfEstimate =
    declaratif.selfEstimatedLevel === undefined
      ? `<p>La personne ne s'est pas prononcée sur son niveau perçu.</p>`
      : `<blockquote class="declared-quote">${esc(declaratif.selfEstimatedLevel)}</blockquote>`;

  const symptomsHtml =
    declaratif.symptoms.length === 0
      ? ""
      : `<div class="symptoms">
  <h4>Symptômes déclarés</h4>
  <ul>
${declaratif.symptoms
  .map((symptom) => `    <li>${esc(symptom.label)} — ${symptom.quotes.map((quote) => `« ${esc(quote)} »`).join(" ; ")}</li>`)
  .join("\n")}
  </ul>
</div>`;

  const negativeHintsHtml =
    declaratif.negativeHints.length === 0
      ? ""
      : `<div class="negative-hints">
  <h4>Indices négatifs déclarés (ne prouvent ni n'infirment seuls — confiance de source 0)</h4>
  <ul>
${declaratif.negativeHints
  .map((hint) => `    <li>${esc(hint.label)} — « ${esc(hint.quote)} »</li>`)
  .join("\n")}
  </ul>
</div>`;

  return `<section class="mirror-section">
  <h2>Miroir : déclaré vs observé</h2>
  <div class="mirror-grid">
    <div class="mirror-declared">
      <h4>Ce que la personne dit de son niveau</h4>
      ${selfEstimate}
    </div>
    <div class="mirror-observed">
      <h4>Ce que les preuves montrent</h4>
      <p>${esc(observedSummary)}</p>
    </div>
  </div>
  ${symptomsHtml}
  ${negativeHintsHtml}
  <p class="mirror-disclaimer">Rappel : le déclaratif n'a aucun poids dans le calcul du rang (spec, « Monotonie ») — il n'apparaît ici qu'à titre de miroir.</p>
</section>`;
}

// ---------------------------------------------------------------------------
// Badge qualité — purement informatif
// ---------------------------------------------------------------------------

function renderQualityBadgeSection(gitActivity: GitActivityData | undefined, sonarMeasures: SonarData | undefined): string {
  const badge = computeQualityBadge(sonarMeasures, gitActivity);
  return `<section class="quality-section">
  <h2>Qualité du code</h2>
  <p class="quality-badge ${QUALITY_BADGE_CLASS[badge]}">${esc(QUALITY_BADGE_LABELS[badge])}</p>
  <p class="quality-disclaimer">Informatif seulement : n'entre dans aucun calcul de rang, de fourchette ni de confiance (spec, Non-goals « plafonnement du rang par la qualité du code : jamais »).</p>
</section>`;
}

// ---------------------------------------------------------------------------
// Incohérences et avertissements
// ---------------------------------------------------------------------------

function renderListSection(title: string, items: readonly string[], emptyText: string): string {
  const body =
    items.length === 0
      ? `<p>${esc(emptyText)}</p>`
      : `<ul>\n${items.map((item) => `  <li>${esc(item)}</li>`).join("\n")}\n</ul>`;
  return `<section class="list-section">
  <h2>${esc(title)}</h2>
  ${body}
</section>`;
}

// ---------------------------------------------------------------------------
// En-tête et pied de page
// ---------------------------------------------------------------------------

/** Couleurs fixes par rang — jamais liées au thème clair/sombre : « White » doit toujours lire blanchâtre, « Gold » toujours doré, quel que soit le fond. */
const RANK_COLORS: Readonly<Record<Rang, string>> = {
  white: "#d8d8d5",
  red: "#c0392b",
  blue: "#2b6cb0",
  green: "#1f7a3f",
  copper: "#b5651d",
  silver: "#9aa0a6",
  gold: "#c9971c",
};

const RANK_LABELS: Readonly<Record<Rang, string>> = {
  white: "White",
  red: "Red",
  blue: "Blue",
  green: "Green",
  copper: "Copper",
  silver: "Silver",
  gold: "Gold",
};

/** Échelle White→Gold, rang affiché marqué, fourchette surlignée — SVG/HTML inline, pas d'image. */
function renderRankLadder(rangAffiche: Rang | null, fourchette: Fourchette): string {
  const n = RANGS_ORDONNES.length;
  const segments = RANGS_ORDONNES.map(
    (rang) => `<div class="rank-ladder__segment" style="background:${RANK_COLORS[rang]}">${esc(RANK_LABELS[rang])}</div>`,
  ).join("\n");

  const basIndex = Math.max(0, RANGS_ORDONNES.indexOf(fourchette.bas));
  const hautIndex = Math.max(0, RANGS_ORDONNES.indexOf(fourchette.haut));
  const fourchetteLeft = (basIndex / n) * 100;
  const fourchetteWidth = ((hautIndex - basIndex + 1) / n) * 100;

  const markerHtml =
    rangAffiche !== null
      ? (() => {
          const rangIndex = RANGS_ORDONNES.indexOf(rangAffiche);
          const markerLeft = ((rangIndex + 0.5) / n) * 100;
          return `<div class="rank-ladder__marker" style="left:${markerLeft.toFixed(2)}%">▲</div>`;
        })()
      : "";

  const ariaLabel = `Rang affiché : ${rangAffiche ?? "indéterminé"}, fourchette ${fourchette.bas} à ${fourchette.haut}, sur l'échelle White à Gold`;

  return `<div class="rank-ladder" role="img" aria-label="${esc(ariaLabel)}">
  <div class="rank-ladder__track">
${segments}
  </div>
  <div class="rank-ladder__fourchette" style="left:${fourchetteLeft.toFixed(2)}%; width:${fourchetteWidth.toFixed(2)}%"></div>
  ${markerHtml}
</div>`;
}

function renderConfidenceGauge(confiance: number): string {
  const percent = Math.round(confiance * 100);
  return `<div class="confidence-gauge" role="img" aria-label="${esc(`Confiance globale : ${percent} pourcent`)}">
  <div class="confidence-gauge__track">
    <div class="confidence-gauge__fill" style="width:${percent}%"></div>
  </div>
  <span class="confidence-gauge__label">${percent}%</span>
</div>`;
}

const HERO_GLOSSARY: readonly { readonly term: string; readonly description: string }[] = [
  {
    term: "Statut",
    description:
      "« ok » : assez de preuves d'usage de l'IA pour juger. « indeterminate » : aucune trace d'usage de l'IA trouvée dans le profil — le rang n'est jamais estimé au hasard.",
  },
  {
    term: "Rang affiché",
    description: "Le rang final annoncé — après un éventuel rabais si l'axe Ownership est très en retard sur les autres axes.",
  },
  {
    term: "Fourchette",
    description: "[bas ; haut] — bas = rang prouvé sans ambiguïté. Haut = rang si TOUTES les marches encore inconnues s'avéraient prouvées.",
  },
  {
    term: "Confiance globale",
    description: "De 0 à 1 — combien de vérifications ont pu être faites, et si les sources sont d'accord entre elles. Jamais une note de qualité de code.",
  },
];

/** Encart explicatif « Comprendre ces chiffres » — rend graphiques les notions de statut/rang/fourchette/confiance, floues en texte brut seul. Boîte pleine largeur, sous la ligne fiche/coup d'œil : empilée à largeur égale (460px) à l'intérieur d'une des deux cases, elle les rendrait disproportionnellement hautes. */
function renderHeroExplainer(document: ResultDocument): string {
  const items = HERO_GLOSSARY.map((entry) => `<li><strong>${esc(entry.term)}</strong><p>${esc(entry.description)}</p></li>`).join("\n");
  return `<section class="hero-explainer" aria-label="Comprendre le rang, la fourchette et la confiance">
  <h2>Comprendre ces chiffres</h2>
  <div class="hero-explainer__layout">
    <div class="hero-explainer__gauges">
      ${renderRankLadder(document.rang_affiche, document.fourchette)}
      ${renderConfidenceGauge(document.confiance_globale)}
    </div>
    <ul class="hero-glossary-list">
${items}
    </ul>
  </div>
</section>`;
}

function renderHeader(document: ResultDocument): string {
  const { title, subtitle } = buildTitleBlock(document);
  return `<header class="report-header">
  <p class="eyebrow">recognAIze — fiche de verdict</p>
  <h1>${esc(title)}</h1>
  <p class="subtitle">${esc(subtitle)}</p>
  <dl class="hero-stats">
    <div><dt>Sujet</dt><dd>${esc(document.profile_id)}</dd></div>
    <div><dt>Statut</dt><dd>${esc(document.status)}</dd></div>
    <div><dt>Rang affiché</dt><dd>${fmtRang(document.rang_affiche)}</dd></div>
    <div><dt>Fourchette</dt><dd>${fmtRang(document.fourchette.bas)} – ${fmtRang(document.fourchette.haut)}</dd></div>
    <div><dt>Confiance globale</dt><dd>${fmtNumber(document.confiance_globale)}</dd></div>
  </dl>
</header>`;
}

/**
 * Annexe : contenu INTÉGRAL du référentiel (`docs/referentiel.md`), une
 * section par marche connue de `concepts.json`, rendu inline dans CE document
 * — voir l'en-tête de ce fichier pour la justification complète (lien de
 * fiche = ancre sur la même page). Chaque section porte l'ancre
 * `id="concept-<marche minuscule>"` ciblée par {@link renderConceptLink}
 * (`concept.lien`) : le lien et son ancre vivent donc TOUJOURS dans le même
 * fichier, et résolvent systématiquement, quel que soit le dossier de sortie
 * où `report.html` est écrit. `detail` est du Markdown source (gras, code
 * inline, tableaux à pipes, paragraphes — le sous-ensemble borné réellement
 * utilisé par `docs/referentiel.md`), converti en HTML réel par
 * {@link renderConceptDetailHtml} (`./concept-markdown.js`) plutôt qu'affiché
 * brut dans un `<pre>`.
 *
 * `concepts === undefined` ⇒ pas d'annexe (cohérent avec `renderConceptLink`,
 * qui ne rend alors aucun lien — donc aucune ancre à fournir). L'ordre des
 * sections suit l'ordre d'insertion de `concepts` — celui, fixe et committé,
 * de `src/referentiel/concepts.json` (T1..T4, H1..H7, I1..I5, P1..P3, O1..O5) —
 * jamais un ordre dépendant du système de fichiers.
 */
function renderConceptAnnex(concepts: ConceptsIndex | undefined): string {
  if (!concepts || concepts.size === 0) {
    return "";
  }
  const sections = [...concepts.values()]
    .map(
      (concept) => `<article class="concept-detail" id="concept-${esc(concept.marche.toLowerCase())}">
  <h3>${esc(concept.marche)} — ${esc(concept.description)}</h3>
  <div class="concept-detail__body">${renderConceptDetailHtml(concept.detail)}</div>
</article>`,
    )
    .join("\n");
  return `<section class="concept-annex" aria-label="Référentiel complet des marches">
  <h2>Annexe — référentiel complet des marches</h2>
  <p class="concept-annex__intro">Détail intégral de chaque marche citée par les fiches ci-dessus (seuils, chemins de preuve, contre-preuve), tel qu'extrait de la source de vérité du référentiel — inline, pour ne dépendre d'aucun fichier externe à ce rapport.</p>
${sections}
</section>`;
}

function renderFooter(document: ResultDocument): string {
  return `<footer class="report-footer">
  <p>
    <code>tool_version</code> ${esc(document.tool_version)} ·
    <code>schema_version</code> ${esc(document.schema_version)} ·
    <code>referentiel_hash</code> ${esc(document.referentiel_hash)}
  </p>
</footer>`;
}

// ---------------------------------------------------------------------------
// CSS — polices système uniquement, aucune ressource externe
// ---------------------------------------------------------------------------

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #f7f7f5;
  --fg: #1c1c1c;
  --muted: #5a5a5a;
  --card-bg: #ffffff;
  --border: #dcdcd8;
  --accent: #2b3a67;
  --prouve: #1f7a3f;
  --indice: #1f6fa3;
  --declare: #7a5c1f;
  --inconnu: #6b6b6b;
  --infirme: #a32020;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161a;
    --fg: #e8e8e6;
    --muted: #a3a3a0;
    --card-bg: #1d2026;
    --border: #33363c;
    --accent: #8fa4e3;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.5;
}
main { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
h1, h2, h3, h4 { line-height: 1.2; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.verdict-glance-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start; margin-bottom: 2rem; }
.verdict-glance-row > * { margin: 0; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-size: 0.8rem; margin: 0 0 0.5rem; }
.report-header h1 { margin: 0; font-size: 1.7rem; }
.subtitle { color: var(--muted); margin: 0.4rem 0 1.2rem; }
.hero-stats { display: flex; flex-wrap: wrap; gap: 1rem 1.2rem; margin: 0; }
.hero-stats > div { min-width: 7rem; }
.hero-stats dt { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; }
.hero-stats dd { margin: 0; font-weight: 600; }

.hero-explainer h2 { margin: 0 0 1rem; font-size: 0.95rem; }
.hero-explainer__layout { display: grid; grid-template-columns: 220px 1fr; gap: 1.5rem; align-items: start; font-size: 0.78rem; }
.hero-explainer__gauges { padding-top: 0.2rem; }
.hero-glossary-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem 1.5rem; }
.hero-glossary-list p { margin: 0.15rem 0 0; color: var(--muted); }

.rank-ladder { position: relative; margin-bottom: 1rem; }
.rank-ladder__track { display: flex; border-radius: 4px; overflow: hidden; height: 1.8rem; }
.rank-ladder__segment { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 700; color: #1c1c1c; }
.rank-ladder__fourchette { position: absolute; top: -3px; height: calc(1.8rem + 6px); border: 2px solid var(--fg); border-radius: 6px; pointer-events: none; box-sizing: border-box; }
.rank-ladder__marker { position: absolute; top: -1.1rem; transform: translateX(-50%); font-size: 0.85rem; color: var(--fg); }

.confidence-gauge { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.8rem; }
.confidence-gauge__track { flex: 1; height: 0.7rem; background: var(--border); border-radius: 999px; overflow: hidden; }
.confidence-gauge__fill { height: 100%; background: var(--accent); }
.confidence-gauge__label { font-weight: 700; font-size: 0.8rem; min-width: 2.4rem; text-align: right; }

@media (max-width: 760px) {
  .verdict-glance-row { grid-template-columns: 1fr; }
  .hero-explainer__layout { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .hero-glossary-list { grid-template-columns: 1fr; }
}
section { margin: 2rem 0; }
.report-header, .axis-section, .missing-section, .mirror-section, .quality-section, .list-section, .glance-section, .hero-explainer {
  background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1.2rem 1.5rem;
}
.glance-summary { margin: 0 0 1rem; }
.radar-figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
.radar-chart { width: 100%; max-width: 320px; height: auto; }
.radar-grid { fill: none; stroke: var(--border); stroke-width: 1; }
.radar-spoke { stroke: var(--border); stroke-width: 1; }
.radar-shape { fill: var(--accent); fill-opacity: 0.25; stroke: var(--accent); stroke-width: 2; }
.radar-dot { fill: var(--accent); }
.radar-label { font-size: 12px; font-weight: 600; fill: var(--fg); font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.radar-figure figcaption { font-size: 0.75rem; color: var(--muted); text-align: center; max-width: 24rem; }
.axis-plain-sentence { margin: 0.4rem 0 0.8rem; font-size: 1rem; }
details.axis-detail { margin-top: 0.6rem; }
details.axis-detail > summary { cursor: pointer; font-weight: 600; color: var(--accent); padding: 0.3rem 0; }
details.axis-detail[open] > summary { margin-bottom: 0.4rem; }

/* Sélecteur d'axe + 2 encarts latéraux repliables ENSEMBLE — CSS pur, sans
   JavaScript. Case à cocher masquée + 2 labels (une par état, une seule
   visible à la fois) : même technique que le sélecteur d'onglets ci-dessous,
   appliquée à un bascule binaire replié/déplié. .sidebar-stack et
   .sidebar-expand-label partagent la même cellule de grille (colonne 1) —
   l'un des deux est toujours caché, jamais les deux visibles ensemble.
   .axes-layout enveloppe TOUT le contenu restant de la page (sélecteur
   d'axe, ce qui manque, miroir, qualité, incohérences, annexe) dans
   .axes-main — pas seulement le sélecteur d'axe — pour que .sidebar-stack
   (sticky) reste visible jusqu'au bas de CE contenu, annexe comprise. Quand
   replié, .axes-main récupère un padding-left le temps que dure le repli,
   pour laisser la place à .sidebar-expand-label (sticky, lui aussi) SANS
   jamais chevaucher le premier onglet. */
.axes-layout { display: grid; grid-template-columns: 220px 1fr; gap: 1.2rem; align-items: start; margin: 2rem 0; }
.sidebar-toggle-input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
.sidebar-stack { grid-column: 1; grid-row: 1; position: sticky; top: 1rem; display: flex; flex-direction: column; gap: 1rem; }
.sidebar-toggle-label { align-self: flex-start; cursor: pointer; font-size: 0.72rem; font-weight: 700; color: var(--muted); user-select: none; }
.sidebar-expand-label {
  grid-column: 1; grid-row: 1; position: sticky; top: 1rem; display: none; width: 1.8rem; height: 1.8rem;
  align-items: center; justify-content: center; cursor: pointer; border: 1px solid var(--border); border-radius: 6px;
  background: var(--card-bg); font-weight: 700; user-select: none; z-index: 1;
}
.axes-main { grid-column: 2; grid-row: 1; min-width: 0; }
#sidebar-toggle:checked ~ .sidebar-stack { display: none; }
#sidebar-toggle:checked ~ .sidebar-expand-label { display: flex; }
#sidebar-toggle:checked ~ .axes-main { grid-column: 1 / -1; padding-left: 2.6rem; }
.glossary-sidebar, .force-glossary-sidebar { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-size: 0.8rem; }
.glossary-sidebar h2, .force-glossary-sidebar h2 { margin: 0 0 0.6rem; font-size: 1rem; }
.glossary-precedence-note { margin: 0 0 0.8rem; font-size: 0.72rem; font-style: italic; color: var(--muted); }
.glossary-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.glossary-list code { font-weight: 700; }
.glossary-list p { margin: 0.15rem 0 0; color: var(--muted); }

.axis-tab-input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
.axis-tab-labels { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 1rem; }
.axis-tab-label { cursor: pointer; padding: 0.4rem 0.9rem; border: 1px solid var(--border); border-radius: 999px; font-weight: 700; font-size: 0.85rem; background: var(--card-bg); user-select: none; }
.axis-panel { display: none; }

#tab-T:checked ~ .axis-tab-labels label[for="tab-T"],
#tab-H:checked ~ .axis-tab-labels label[for="tab-H"],
#tab-I:checked ~ .axis-tab-labels label[for="tab-I"],
#tab-P:checked ~ .axis-tab-labels label[for="tab-P"],
#tab-O:checked ~ .axis-tab-labels label[for="tab-O"] { background: var(--accent); color: var(--bg); border-color: var(--accent); }

#tab-T:checked ~ .axis-panels .axis-panel[data-axis="T"],
#tab-H:checked ~ .axis-panels .axis-panel[data-axis="H"],
#tab-I:checked ~ .axis-panels .axis-panel[data-axis="I"],
#tab-P:checked ~ .axis-panels .axis-panel[data-axis="P"],
#tab-O:checked ~ .axis-panels .axis-panel[data-axis="O"] { display: block; }

@media (max-width: 720px) {
  .axes-layout { grid-template-columns: 1fr; }
  .sidebar-stack, .sidebar-expand-label { position: static; grid-column: 1; }
  .axes-main, #sidebar-toggle:checked ~ .axes-main { grid-column: 1; grid-row: 2; padding-left: 0; }
}
.axis-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.5rem 1rem; margin: 0.8rem 0; }
.axis-stats dt { font-size: 0.75rem; color: var(--muted); }
.axis-stats dd { margin: 0; }
.axis-blocking { padding: 0.6rem 0.8rem; border-left: 3px solid var(--infirme); background: rgba(163, 32, 32, 0.06); }
.axis-blocking--none { border-left-color: var(--prouve); background: rgba(31, 122, 63, 0.06); }
.next-step { margin-top: 0.8rem; padding: 0.6rem 0.8rem; border: 1px dashed var(--border); border-radius: 6px; }
.next-step h4 { margin: 0 0 0.4rem; font-size: 0.9rem; }
.next-step__description, .next-step__manque-title { margin: 0.3rem 0; font-size: 0.85rem; }
.next-step__manque { margin: 0.2rem 0 0.4rem; padding-left: 1.2rem; font-size: 0.8rem; color: var(--muted); }
.next-step--sommet { border-color: var(--prouve); }
.next-step--indetermine { border-color: var(--inconnu); }
.concept-link { color: var(--accent); }
.marche-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1rem; margin-top: 1rem; }
.marche-card { border: 1px solid var(--border); border-radius: 6px; padding: 0.8rem 1rem; background: var(--bg); }
.marche-card__header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.marche-card__header h4 { margin: 0; font-size: 0.95rem; }
.pill { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid currentColor; }
.etat-prouve { color: var(--prouve); }
.etat-indice { color: var(--indice); }
.etat-declare { color: var(--declare); }
.etat-inconnu { color: var(--inconnu); }
.etat-infirme { color: var(--infirme); }
.etat-compris { color: var(--muted); }
.proof-paths { list-style: none; margin: 0.6rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.proof-path { border-top: 1px dashed var(--border); padding-top: 0.5rem; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem; }
.proof-path .path-desc { flex-basis: 100%; }
.path-id { font-weight: 700; }
.path-status { font-size: 0.75rem; color: var(--muted); }
.path-desc { margin: 0.2rem 0 0; font-size: 0.85rem; color: var(--muted); }
.evidence-list { list-style: none; margin: 0.4rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.evidence-item { font-size: 0.85rem; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem; }
.evidence-source { font-weight: 600; }
.evidence-item--contre-preuve .evidence-polarite { color: var(--infirme); font-weight: 600; }
.evidence-item--preuve .evidence-polarite { color: var(--prouve); font-weight: 600; }
/* Icône de polarité — ✓/✗/– donnent la réponse au premier coup d'œil ; la citation
   brute reste disponible juste en dessous, en code discret, pour qui veut la valeur exacte. */
.evidence-icon { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 1.15rem; height: 1.15rem; border-radius: 50%; font-size: 0.7rem; font-weight: 700; line-height: 1; }
.evidence-icon--preuve { color: var(--prouve); background: rgba(31, 122, 63, 0.14); }
.evidence-icon--preuve::before { content: "✓"; }
.evidence-icon--contre-preuve { color: var(--infirme); background: rgba(163, 32, 32, 0.14); }
.evidence-icon--contre-preuve::before { content: "✗"; }
.evidence-icon--absent { color: var(--inconnu); border: 1px dashed var(--border); }
.evidence-icon--absent::before { content: "–"; }
.evidence-citation { flex-basis: 100%; margin: 0 0 0 1.55rem; color: var(--muted); font-size: 0.78rem; }
.no-proof-path { color: var(--muted); font-size: 0.85rem; }
.counter-proof { margin-top: 0.6rem; font-size: 0.8rem; color: var(--muted); }
.marche-card__footer { margin-top: 0.6rem; font-size: 0.75rem; }
.concept-pending { color: var(--muted); font-style: italic; }
.missing-axis { margin-bottom: 1rem; }
.missing-axis:last-child { margin-bottom: 0; }
.mirror-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 1rem; }
.declared-quote { margin: 0.4rem 0 0; padding: 0.6rem 0.8rem; border-left: 3px solid var(--accent); background: rgba(43, 58, 103, 0.06); font-style: italic; }
.mirror-disclaimer, .quality-disclaimer { font-size: 0.8rem; color: var(--muted); margin-top: 1rem; }
.quality-badge { display: inline-block; padding: 0.3rem 0.8rem; border-radius: 999px; font-weight: 700; }
.badge-vert { background: rgba(31, 122, 63, 0.15); color: var(--prouve); }
.badge-orange { background: rgba(178, 120, 20, 0.15); color: #b27814; }
.badge-rouge { background: rgba(163, 32, 32, 0.15); color: var(--infirme); }
.badge-non-evalue { background: rgba(107, 107, 107, 0.15); color: var(--inconnu); }
.report-footer { padding: 1.5rem; text-align: center; color: var(--muted); font-size: 0.8rem; border-top: 1px solid var(--border); }
.concept-annex__intro { color: var(--muted); font-size: 0.85rem; }
.concept-detail { border-top: 1px dashed var(--border); padding-top: 1rem; margin-top: 1rem; }
.concept-detail:first-of-type { margin-top: 0; }
.concept-detail h3 { margin: 0 0 0.5rem; font-size: 1rem; }
.concept-detail__body {
  margin: 0;
  padding: 0.8rem 1rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.8rem;
  word-break: break-word;
  overflow-x: auto;
}
.concept-detail__body p { margin: 0 0 0.6rem; }
.concept-detail__body p:last-child { margin-bottom: 0; }
.concept-detail__body code { background: rgba(43, 58, 103, 0.08); padding: 0.05rem 0.3rem; border-radius: 3px; }
.concept-detail__table { border-collapse: collapse; width: 100%; margin: 0 0 0.6rem; font-size: 0.78rem; }
.concept-detail__table:last-child { margin-bottom: 0; }
.concept-detail__table th, .concept-detail__table td { border: 1px solid var(--border); padding: 0.3rem 0.5rem; text-align: left; vertical-align: top; }
.concept-detail__table th { white-space: nowrap; }
.concept-detail__table th { background: rgba(43, 58, 103, 0.06); }
`;

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

/**
 * Construit le `report.html` complet, PUR (aucune E/S) — voir l'en-tête de ce
 * fichier pour `referentiel`/`extras`. `concepts` (optionnel) alimente les
 * liens de fiche et les blocs « prochaine marche » ; absent (`undefined`) ⇒
 * replis textuels partout, jamais un crash ni un lien cassé (même posture que
 * `ReportExtras`, chaque champ optionnel).
 */
export function buildReportHtml(
  document: ResultDocument,
  referentiel: Referentiel,
  extras: ReportExtras = {},
  concepts?: ConceptsIndex,
): string {
  const referentielIndex = indexReferentiel(referentiel);
  const evidenceByPathId = indexEvidenceByPathId(document.evidence);
  const axisLabels = new Map(referentiel.axes.map((axis) => [axis.id, axis.label]));
  const verdictByAxe = new Map(document.verdicts.map((verdict) => [verdict.axe, verdict]));
  const axisById = new Map(referentiel.axes.map((axis) => [axis.id, axis]));

  // Sélecteur d'axe : un onglet CSS pur par axe (radio caché + sélecteur
  // `:checked`, jamais de <script> — préserve l'invariant « report.html
  // n'exécute jamais rien » sur lequel reposent les tests anti-XSS de ce même
  // fichier) plutôt que 5 cartes empilées à faire défiler. Chaque signal
  // (source, citation, polarité) n'a qu'un seul rendu, dans
  // `renderProofPathRow` — jamais un second panneau dupliquant la même
  // information, qui deviendrait désynchronisable.
  const TAB_AXES: readonly AxeId[] = [...OFFICIAL_AXES, "O"];
  const axisPanels = TAB_AXES.map((axeId) => {
    const axis = axisById.get(axeId);
    if (!axis) return "";
    const mainHtml =
      axeId === "O"
        ? renderOwnershipSection(document.ownership, referentielIndex, evidenceByPathId, concepts)
        : (() => {
            const axisJudgement = document.axes.find((entry) => entry.axe === axeId);
            const verdict = verdictByAxe.get(axeId);
            if (!axisJudgement || !verdict) return "";
            return renderAxisSection(axisJudgement, verdict, axisLabels.get(axeId) ?? axeId, axis, referentielIndex, evidenceByPathId, concepts);
          })();
    return `<div class="axis-panel" data-axis="${esc(axeId)}">${mainHtml}</div>`;
  }).join("\n");

  const axisTabInputs = TAB_AXES.map((axeId) => `<input type="radio" name="axis-tab" id="tab-${esc(axeId)}" class="axis-tab-input"${axeId === TAB_AXES[0] ? " checked" : ""}>`).join("\n");
  const axisTabLabels = TAB_AXES.map(
    (axeId) => `<label for="tab-${esc(axeId)}" class="axis-tab-label">${esc(axeId)} — ${esc(axeId === "O" ? "Ownership" : axisLabels.get(axeId) ?? axeId)}</label>`,
  ).join("\n");

  const glanceSection = renderGlanceSection(document, referentiel, referentielIndex, axisLabels);
  const glossarySidebar = renderGlossarySidebar(referentiel.confiance_source);
  const forceGlossarySidebar = renderForceGlossarySidebar();
  const missingSection = renderMissingSection(document, document.ownership, referentielIndex, axisLabels);
  const mirrorSection = renderMirrorSection(extras.declaratif, document);
  const qualitySection = renderQualityBadgeSection(extras.gitActivity, extras.sonarMeasures);
  const incoherencesSection = renderListSection("Incohérences", document.incoherences, "Aucune incohérence détectée entre les sources.");
  const conceptAnnexSection = renderConceptAnnex(concepts);
  // `document.warnings[]` n'est PAS rendu dans `report.html` (contrairement
  // aux incohérences) : certains avertissements décrivent en PROSE une valeur
  // JSON malformée reçue du profil (ex. `git-activity.json [invalid_field] :
  // … (reçu null, objet attendu)`) — les rendre romprait frontalement la
  // contrainte dure « aucun undefined/null/NaN visible » (spec, « Sorties »),
  // alors que ce « null » n'est ici qu'un mot de la phrase, jamais un
  // artefact de rendu cassé. `result.json`.`warnings[]` reste la seule source
  // de vérité pour les avertissements.

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>recognAIze — ${esc(document.profile_id)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<div class="verdict-glance-row">
${renderHeader(document)}
${glanceSection}
</div>
${renderHeroExplainer(document)}
<div class="axes-layout">
<input type="checkbox" id="sidebar-toggle" class="sidebar-toggle-input">
<label for="sidebar-toggle" class="sidebar-expand-label" aria-label="Afficher les encarts d'aide (sources, force d'une preuve)">▶</label>
<div class="sidebar-stack">
<label for="sidebar-toggle" class="sidebar-toggle-label" aria-label="Réduire les encarts d'aide">◀ Réduire</label>
${glossarySidebar}
${forceGlossarySidebar}
</div>
<div class="axes-main">
<section class="axes">
<div class="axis-switcher">
${axisTabInputs}
<div class="axis-tab-labels">
${axisTabLabels}
</div>
<div class="axis-panels">
${axisPanels}
</div>
</div>
</section>
${missingSection}
${mirrorSection}
${qualitySection}
${incoherencesSection}
${conceptAnnexSection}
</div>
</div>
</main>
${renderFooter(document)}
</body>
</html>
`;
}

/** Écrit `<outputDir>/report.html`, atomiquement — voir `src/report/atomic-write.ts`. */
export function writeReportHtml(
  outputDir: string,
  document: ResultDocument,
  referentiel: Referentiel,
  extras: ReportExtras = {},
  concepts?: ConceptsIndex,
): void {
  const html = buildReportHtml(document, referentiel, extras, concepts);
  atomicWriteFileSync(`${outputDir}/report.html`, html);
}
