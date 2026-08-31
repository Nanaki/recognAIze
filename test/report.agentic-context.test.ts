/**
 * Section agentique optionnelle de `report.html` (`AgenticContext`,
 * `src/report/html.ts`) : absente ⇒ zéro effet sur le rendu (verrouillé par
 * `test/report.snapshot.test.ts`, qui construit `buildReportHtml` SANS ce
 * paramètre) ; présente ⇒ bandeau, comparaison par axe, delta de confiance
 * et diff des incohérences, sans `undefined`/`null`/`NaN`, et rendu
 * déterministe (même entrée deux fois ⇒ même sortie).
 *
 * Construit `ResultDocument`/`ReportExtras` via `runAnalysis` sur un étalon
 * réel (bohort), comme `test/report.snapshot.test.ts` — même précédent,
 * jamais un second document synthétique inventé à la main.
 */

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { runAnalysis } from "../src/analyze.js";
import { buildReportHtml, type AgenticContext, type ReportExtras } from "../src/report/html.js";
import { buildResultDocument } from "../src/report/json.js";
import { loadConcepts } from "../src/report/next-step.js";

const CONCEPTS = loadConcepts();
const TEST_FILE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "..");

const OUTCOME = runAnalysis(join(REPO_ROOT, "fixtures/profiles/bohort"), "bohort-agentic-context-test", {
  includeExperimentalLlm: true,
});
const DOCUMENT = buildResultDocument(OUTCOME, "bohort-agentic-context-test");
const EXTRAS: ReportExtras = {
  declaratif: OUTCOME.ctx.declaratif,
  gitActivity: OUTCOME.ctx.gitActivity,
  sonarMeasures: OUTCOME.ctx.sonarMeasures,
};

/** Contexte agentique synthétique où les deux chemins concordent exactement — dérivé du document réel, jamais de nombres inventés sans rapport. */
function agreeingAgenticContext(): AgenticContext {
  return {
    deterministic: {
      rang_affiche: DOCUMENT.rang_affiche,
      fourchette: DOCUMENT.fourchette,
      confiance_globale: DOCUMENT.confiance_globale,
      axes: DOCUMENT.axes.map((axis) => ({ axe: axis.axe, niveau_prouve: axis.niveau_prouve, confiance: axis.confiance })),
      incoherences: DOCUMENT.incoherences,
    },
    comparison: {
      rows: DOCUMENT.axes.map((axis) => {
        const verdict = DOCUMENT.verdicts.find((v) => v.axe === axis.axe);
        return { axe: axis.axe, deterministic: verdict?.niveau_ponctuel ?? null, agentic: verdict?.niveau_ponctuel ?? null, match: true };
      }),
      mismatch_notes: [],
    },
    execution: {
      model: "claude-sonnet-5",
      token_estimate: { prompt_chars: 29030, output_chars: 20385, estimated_tokens: 12354, note: "estimation grossière, pas une mesure exacte." },
      cost_estimate: { usd: 0.0655, note: "dérivé de l'estimation de tokens ci-dessus — approximatif." },
      generated_at: "2026-08-31T01:26:41.016Z",
    },
  };
}

/** Variante avec un désaccord explicite sur l'axe T, pour couvrir la branche « désaccord ». */
function disagreeingAgenticContext(): AgenticContext {
  const base = agreeingAgenticContext();
  return {
    ...base,
    comparison: {
      rows: base.comparison.rows.map((row) => (row.axe === "T" ? { ...row, agentic: "T4", match: false } : row)),
      mismatch_notes: ["T : déterministe=T2, agentique=T4 — GA.xl_ratio lu différemment par l'extracteur."],
    },
  };
}

describe("buildReportHtml sans agenticContext : aucune trace du chemin agentique", () => {
  // `.agentic-banner`/`.agentic-comparison` existent comme sélecteurs CSS STATIQUES
  // dans `<style>` quel que soit l'appel (voir `test/report.snapshot.test.ts`,
  // seul le CSS diffère) — cherche les ÉLÉMENTS réels, jamais la simple présence
  // du nom de classe (qui matcherait aussi la règle CSS inerte).
  test("aucun élément de bandeau ni de section de comparaison dans le corps de la page", () => {
    const html = buildReportHtml(DOCUMENT, OUTCOME.referentiel, EXTRAS, CONCEPTS);
    expect(html).not.toContain('<div class="agentic-banner"');
    expect(html).not.toContain('<section class="agentic-comparison"');
    expect(html).not.toContain("Verdict AGENTIQUE");
  });
});

describe("buildReportHtml avec agenticContext : bandeau, comparaison, delta, diff", () => {
  test("bandeau agentique présent et explicite", () => {
    const html = buildReportHtml(DOCUMENT, OUTCOME.referentiel, EXTRAS, CONCEPTS, agreeingAgenticContext());
    expect(html).toContain('<div class="agentic-banner"');
    expect(html).toContain("Verdict AGENTIQUE");
    expect(html).toContain("claude-sonnet-5");
  });

  test("table de comparaison par axe : concordance affichée pour chaque axe", () => {
    const html = buildReportHtml(DOCUMENT, OUTCOME.referentiel, EXTRAS, CONCEPTS, agreeingAgenticContext());
    expect(html).toContain("Comparaison au chemin déterministe");
    expect(html).toContain("Rang par axe");
    for (const axis of DOCUMENT.axes) {
      expect(html).toContain(`<td>${axis.axe}</td>`);
    }
  });

  test("accord parfait ⇒ « Aucun désaccord », et desaccord réel ⇒ mismatch explicite (jamais silencieux)", () => {
    const agreeing = buildReportHtml(DOCUMENT, OUTCOME.referentiel, EXTRAS, CONCEPTS, agreeingAgenticContext());
    expect(agreeing).toContain("Aucun désaccord entre les deux chemins sur ce profil.");

    const disagreeing = buildReportHtml(DOCUMENT, OUTCOME.referentiel, EXTRAS, CONCEPTS, disagreeingAgenticContext());
    expect(disagreeing).not.toContain("Aucun désaccord entre les deux chemins sur ce profil.");
    expect(disagreeing).toContain("GA.xl_ratio lu différemment");
  });

  test("delta de confiance par axe : « = » quand les deux chemins concordent exactement", () => {
    const html = buildReportHtml(DOCUMENT, OUTCOME.referentiel, EXTRAS, CONCEPTS, agreeingAgenticContext());
    expect(html).toContain("Confiance par axe");
    expect(html).toContain("<td>=</td>");
  });

  test("diff des incohérences : toutes communes quand les deux listes sont identiques", () => {
    const html = buildReportHtml(DOCUMENT, OUTCOME.referentiel, EXTRAS, CONCEPTS, agreeingAgenticContext());
    expect(html).toContain(`Communes aux deux chemins (${DOCUMENT.incoherences.length})`);
    expect(html).toContain("Seulement côté déterministe (0)");
    expect(html).toContain("Seulement côté agentique (0)");
  });

  test("bloc exécution : modèle, tokens et coût affichés avec leurs notes d'estimation", () => {
    const html = buildReportHtml(DOCUMENT, OUTCOME.referentiel, EXTRAS, CONCEPTS, agreeingAgenticContext());
    expect(html).toContain("Exécution (estimation, jamais une mesure)");
    expect(html).toContain("estimation grossière");
    expect(html).toContain("approximatif");
  });

  test("aucun undefined/null/NaN visible", () => {
    const html = buildReportHtml(DOCUMENT, OUTCOME.referentiel, EXTRAS, CONCEPTS, agreeingAgenticContext());
    expect(html).not.toContain("undefined");
    expect(html).not.toContain(">null<");
    expect(html).not.toContain("NaN");
  });

  test("déterminisme : même document + même agenticContext deux fois ⇒ sortie strictement identique", () => {
    const first = buildReportHtml(DOCUMENT, OUTCOME.referentiel, EXTRAS, CONCEPTS, agreeingAgenticContext());
    const second = buildReportHtml(DOCUMENT, OUTCOME.referentiel, EXTRAS, CONCEPTS, agreeingAgenticContext());
    expect(first).toBe(second);
  });
});
