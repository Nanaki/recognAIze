// `src/report/concept-markdown.ts` — conversion du Markdown borné de
// `concept.detail` (gras, code inline, tableaux à pipes, paragraphes) en HTML
// réel, plutôt que la syntaxe brute affichée telle quelle dans un `<pre>`.
//
// Sans cette conversion, chaque fiche de concept affiche littéralement
// `**Tâche S**`, les tuyaux `| path_id | ... |` et les backticks
// `` `GA.size_median` `` à l'écran — `src/report/html.ts` échappe
// `concept.detail` mais ne le convertit jamais en HTML. Ce fichier couvre :
// - le rendu unitaire de {@link renderConceptDetailHtml} sur les 4
//   constructions réellement utilisées (gras, code inline, tableau,
//   paragraphe), échappement d'un contenu hostile compris ;
// - la régression sur un PROFIL RÉEL (`fixtures/profiles/arthur`) : le
//   `report.html` généré ne doit plus jamais contenir de construction
//   Markdown brute (`**`, tuyau de tableau, backtick isolé).

import { describe, expect, test } from "vitest";

import { runAnalysis } from "../src/analyze.js";
import { buildReportHtml, type ReportExtras } from "../src/report/html.js";
import { renderConceptDetailHtml } from "../src/report/concept-markdown.js";
import { buildResultDocument } from "../src/report/json.js";
import { loadConcepts } from "../src/report/next-step.js";

const CONCEPTS = loadConcepts();

describe("renderConceptDetailHtml : sous-ensemble Markdown borné (gras, code inline, tableau, paragraphe)", () => {
  test("**gras** devient <strong>, jamais affiché en syntaxe brute", () => {
    const html = renderConceptDetailHtml("**Tâche S** — rang Red.");
    expect(html).toContain("<strong>Tâche S</strong>");
    expect(html).not.toContain("**");
  });

  test("`code inline` devient <code>, jamais affiché en syntaxe brute", () => {
    const html = renderConceptDetailHtml("Signal `GA.size_median` observé.");
    expect(html).toContain("<code>GA.size_median</code>");
    expect(html).not.toContain("`");
  });

  test("un tableau à pipes (en-tête + séparateur) devient une vraie <table>, jamais des tuyaux bruts", () => {
    const markdown = [
      "| `path_id` | Force | Seuil |",
      "| --- | --- | --- |",
      "| `T2.p1` | prouve | `GA.size_median ≥ M` |",
    ].join("\n");
    const html = renderConceptDetailHtml(markdown);
    expect(html).toContain("<table");
    expect(html).toContain("<th><code>path_id</code></th>");
    expect(html).toContain("<td><code>T2.p1</code></td>");
    expect(html).not.toContain("|");
    expect(html).not.toContain("---");
  });

  test("deux paragraphes séparés par une ligne vide deviennent deux <p>, un seul par paragraphe multi-lignes", () => {
    const markdown = ["Première ligne", "suite de la même phrase.", "", "Second paragraphe."].join("\n");
    const html = renderConceptDetailHtml(markdown);
    expect(html).toBe("<p>Première ligne suite de la même phrase.</p>\n<p>Second paragraphe.</p>");
  });

  test("un contenu hostile à l'intérieur d'un gras ou d'un code reste échappé — jamais de <script> réel introduit par la conversion", () => {
    const html = renderConceptDetailHtml("**<script>alert(1)</script>** et `<img src=x onerror=alert(1)>`");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>");
    expect(html).toContain("<code>&lt;img src=x onerror=alert(1)&gt;</code>");
  });
});

describe("report.html (profil réel) : plus aucune construction Markdown brute dans l'annexe référentiel (AC, DEC-005)", () => {
  // `fixtures/profiles/arthur` reproduit la construction Markdown brute
  // (gras, tuyaux de tableau, backticks) telle qu'affichée sans conversion.
  const outcome = runAnalysis("fixtures/profiles/arthur", "arthur-concept-md", { includeExperimentalLlm: true });
  const document = buildResultDocument(outcome, "arthur-concept-md");
  const extras: ReportExtras = {
    declaratif: outcome.ctx.declaratif,
    gitActivity: outcome.ctx.gitActivity,
    sonarMeasures: outcome.ctx.sonarMeasures,
  };
  const html = buildReportHtml(document, outcome.referentiel, extras, CONCEPTS);

  test("les 24 fiches de concept sont bien rendues (annexe présente)", () => {
    expect([...CONCEPTS.values()]).toHaveLength(24);
    for (const concept of CONCEPTS.values()) {
      expect(html).toContain(`id="concept-${concept.marche.toLowerCase()}"`);
    }
  });

  test("aucun `**` de gras brut ne subsiste dans le HTML généré", () => {
    expect(html).not.toContain("**");
  });

  test("aucun tuyau de tableau Markdown brut (`|`) ne subsiste dans le HTML généré", () => {
    expect(html).not.toContain("|");
  });

  test("aucun backtick isolé (code inline Markdown non converti) ne subsiste dans le HTML généré", () => {
    expect(html).not.toContain("`");
  });

  test("la conversion a bien eu lieu : <strong>, <code> et <table> sont réellement présents dans l'annexe", () => {
    expect(html).toContain("<strong>");
    expect(html).toContain("<table");
    expect(html.match(/<code>/g)?.length ?? 0).toBeGreaterThan(0);
  });
});
