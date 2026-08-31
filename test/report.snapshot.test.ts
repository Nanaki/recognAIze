/**
 * `report.html` réel : snapshot par étalon + profil hostile, absence dédiée
 * de `undefined`/`null`/`NaN`, absence de ressource externe, échappement
 * d'un contenu déclaratif hostile, largeur de fourchette -> titre.
 *
 * Construit `ResultDocument`/`ReportExtras` directement via `runAnalysis` +
 * `buildResultDocument` (comme `test/report.json.test.ts`) plutôt que par la
 * CLI compilée : plus rapide à itérer. L'écriture réelle de `report.html`
 * par la CLI reste couverte par `test/e2e-jury.test.ts`, sur un clone frais.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { runAnalysis, type AnalysisOutcome } from "../src/analyze.js";
import type { Referentiel } from "../src/core/referentiel.js";
import { buildReportHtml, type ReportExtras } from "../src/report/html.js";
import { esc } from "../src/report/esc.js";
import { buildResultDocument, type ResultDocument } from "../src/report/json.js";
import { loadConcepts } from "../src/report/next-step.js";
import type { DeclaratifData } from "../src/sources/declaratif.js";

const CONCEPTS = loadConcepts();

const TEST_FILE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "..");

function extrasOf(outcome: AnalysisOutcome): ReportExtras {
  return {
    declaratif: outcome.ctx.declaratif,
    gitActivity: outcome.ctx.gitActivity,
    sonarMeasures: outcome.ctx.sonarMeasures,
  };
}

interface Built {
  readonly document: ResultDocument;
  readonly referentiel: Referentiel;
  readonly extras: ReportExtras;
  readonly html: string;
}

function buildFor(dir: string, subjectId: string): Built {
  const outcome = runAnalysis(join(REPO_ROOT, dir), subjectId, { includeExperimentalLlm: true });
  const document = buildResultDocument(outcome, subjectId);
  const extras = extrasOf(outcome);
  const html = buildReportHtml(document, outcome.referentiel, extras, CONCEPTS);
  return { document, referentiel: outcome.referentiel, extras, html };
}

const FIXTURES: readonly { readonly name: string; readonly dir: string; readonly subjectId: string }[] = [
  { name: "perceval", dir: "fixtures/profiles/perceval", subjectId: "perceval-snap" },
  { name: "bohort", dir: "fixtures/profiles/bohort", subjectId: "bohort-snap" },
  { name: "leodagan", dir: "fixtures/profiles/leodagan", subjectId: "leodagan-snap" },
  { name: "arthur", dir: "fixtures/profiles/arthur", subjectId: "arthur-snap" },
  { name: "hostile", dir: "fixtures/hostile", subjectId: "hostile-snap" },
  // Statut "indeterminate" réel (fixtures/synthetic/no-ai-trace, aucune
  // preuve d'usage de l'IA nulle part) — snapshot dédié, en plus des
  // assertions de contenu ciblées plus bas.
  { name: "no-ai-trace", dir: "fixtures/synthetic/no-ai-trace", subjectId: "no-ai-trace-snap" },
];

const BUILT: ReadonlyMap<string, Built> = new Map(FIXTURES.map((fixture) => [fixture.name, buildFor(fixture.dir, fixture.subjectId)]));

// `report.html` embarque `document.node_version` (`process.versions.node`)
// littéralement (`src/report/html.ts:634`) — un fait d'exécution qui varie
// selon la version de Node (matrice CI Node 20 / 22) et ne doit donc jamais
// figer un snapshot de contenu. Remplacé par un jeton fixe avant
// `toMatchSnapshot`, indépendamment de la version de Node qui exécute le test.
const NODE_VERSION_PLACEHOLDER = "<normalized-node-version>";
function redactNodeVersion(html: string): string {
  return html.split(process.versions.node).join(NODE_VERSION_PLACEHOLDER);
}

// ---------------------------------------------------------------------------
// Snapshots — un par étalon + le profil hostile
// ---------------------------------------------------------------------------

describe("report.html : snapshot par étalon et profil hostile", () => {
  test.for(FIXTURES)("$name : snapshot stable", ({ name }) => {
    const built = BUILT.get(name);
    expect(built).toBeDefined();
    expect(redactNodeVersion(built?.html ?? "")).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// AC : aucun undefined/null/NaN visible, sur les 4 étalons ET le profil hostile
// ---------------------------------------------------------------------------

describe("report.html : jamais de undefined/null/NaN visible (AC dédié)", () => {
  test.for(FIXTURES)("$name : aucune des 3 sous-chaînes interdites", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
    expect(html).not.toContain("NaN");
  });
});

// ---------------------------------------------------------------------------
// AC : aucune ressource externe, ouvrable en file:// hors ligne, ≤ 2 Mo
// ---------------------------------------------------------------------------

const TWO_MEGABYTES = 2 * 1024 * 1024;

describe("report.html : aucune ressource externe, taille ≤ 2 Mo (AC)", () => {
  test.for(FIXTURES)("$name : aucune URL http(s), aucun CDN", ({ name }) => {
    const html = BUILT.get(name)?.html ?? "";
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/\/\/cdn\./i);
  });

  test.for(FIXTURES)("$name : taille ≤ 2 Mo", ({ name }) => {
    const html = BUILT.get(name)?.html ?? "";
    expect(Buffer.byteLength(html, "utf8")).toBeLessThanOrEqual(TWO_MEGABYTES);
  });

  test.for(FIXTURES)("$name : commence par <!doctype html>, structure minimale présente", ({ name }) => {
    const html = BUILT.get(name)?.html ?? "";
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<html lang=\"fr\">");
    expect(html).toContain("</html>");
    expect(html).toContain("<style>");
  });
});

// ---------------------------------------------------------------------------
// AC : aucun état « compris » (réservé à l'entretien, hors périmètre)
// ---------------------------------------------------------------------------

describe("report.html : jamais l'état « compris » (AC)", () => {
  // « compris » apparaît légitimement dans le LIBELLÉ de la marche I5 (« jamais,
  // cadrage compris », référentiel.json) — prose française sans rapport avec
  // l'état. L'AC porte sur l'ÉTAT (jamais produit par `judge()`, cf. sa
  // docstring), vérifié ici sur le marqueur de rendu réel de l'état, pas sur une
  // sous-chaîne aveugle.
  test.for(FIXTURES)("$name : aucune pastille d'état « compris » rendue", ({ name }) => {
    const html = BUILT.get(name)?.html ?? "";
    expect(html).not.toMatch(/class="pill etat-compris">compris</);
  });
});

// ---------------------------------------------------------------------------
// AC : échappement — contenu déclaratif hostile (<script>, </div>)
// ---------------------------------------------------------------------------

describe("esc() : échappement unique, testé contre le payload réel de fixtures/hostile/declaratif.md", () => {
  test("le payload <script>alert('xss')</script> du fichier hostile réel est intégralement neutralisé", () => {
    const raw = readFileSync(join(REPO_ROOT, "fixtures", "hostile", "declaratif.md"), "utf8");
    expect(raw).toContain("<script>alert('xss')</script>");

    const escaped = esc(raw);

    expect(escaped).not.toContain("<script>");
    expect(escaped).not.toContain("</script>");
    expect(escaped).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  test("&, <, >, \", ' sont tous les cinq échappés", () => {
    expect(esc(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });
});

function balancedTagCount(html: string, tag: string): { open: number; close: number } {
  const openMatches = html.match(new RegExp(`<${tag}(\\s[^>]*)?>`, "gi")) ?? [];
  const closeMatches = html.match(new RegExp(`</${tag}>`, "gi")) ?? [];
  return { open: openMatches.length, close: closeMatches.length };
}

describe("report.html : un déclaratif hostile (<script>, </div>) reste échappé dans la page réelle, structure valide (AC)", () => {
  test("selfEstimatedLevel hostile injecté : jamais de <script> réel, </div> injecté neutralisé, structure toujours équilibrée", () => {
    const base = BUILT.get("bohort");
    expect(base).toBeDefined();
    if (!base) return;

    const hostileDeclaratif: DeclaratifData = {
      answered: true,
      qas: [{ question: "Quel est ton niveau selon toi ?", answer: "<script>alert('xss')</script> et une balise fermante </div> ici" }],
      selfEstimatedLevel: "<script>alert('xss')</script> et une balise fermante </div> ici",
      symptoms: [
        {
          id: "hostile_symptom",
          label: "manque de contexte",
          quotes: ["il oublie ce qu'on s'est dit <script>alert(1)</script>"],
        },
      ],
      negativeHints: [
        {
          id: "hostile_hint",
          label: "un fil à la fois",
          quote: "un fil à la fois </div><div class=\"injected\">",
          confianceSource: 0,
        },
      ],
    };

    const htmlAfter = buildReportHtml(base.document, base.referentiel, { ...base.extras, declaratif: hostileDeclaratif });

    // Le payload brut n'apparaît JAMAIS tel quel — ni la balise <script>, ni un
    // </div> injecté qui romprait la structure de la page.
    expect(htmlAfter).not.toContain("<script>alert('xss')</script>");
    expect(htmlAfter).not.toContain("<script>alert(1)</script>");
    expect(htmlAfter).not.toMatch(/<script[\s>]/i);

    // Forme échappée présente telle quelle (preuve que le contenu a bien été
    // recopié, pas simplement omis).
    expect(htmlAfter).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    expect(htmlAfter).toContain("&lt;div class=&quot;injected&quot;&gt;");

    // La structure reste valide : le </div> et le <div class="injected">
    // injectés (échappés, donc jamais interprétés comme balise) n'ont ni
    // refermé ni ouvert de vraie balise — le document reste équilibré.
    for (const tag of ["div", "html", "head", "body", "main", "section", "article", "ul", "li", "dl"]) {
      const counts = balancedTagCount(htmlAfter, tag);
      expect(counts.open, `<${tag}> non équilibré`).toBe(counts.close);
    }

    expect(htmlAfter).not.toContain("undefined");
    expect(htmlAfter).not.toContain("null");
    expect(htmlAfter).not.toContain("NaN");
  });
});

// ---------------------------------------------------------------------------
// AC : largeur de fourchette -> titre
// ---------------------------------------------------------------------------

describe("report.html : titre selon la largeur de fourchette (AC)", () => {
  function withFourchette(base: Built, bas: ResultDocument["fourchette"]["bas"], haut: ResultDocument["fourchette"]["haut"]): string {
    const document: ResultDocument = { ...base.document, fourchette: { bas, haut } };
    return buildReportHtml(document, base.referentiel, base.extras);
  }

  test("largeur 0 : le rang affiché est le titre (h1)", () => {
    const base = BUILT.get("bohort");
    expect(base).toBeDefined();
    if (!base) return;
    const html = withFourchette(base, "blue", "blue");
    expect(html).toMatch(/<h1>blue<\/h1>/);
  });

  test("largeur 2 : la fourchette devient le titre, le point bas et sa cause en sous-titre", () => {
    const base = BUILT.get("bohort");
    expect(base).toBeDefined();
    if (!base) return;
    const html = withFourchette(base, "blue", "copper");
    expect(html).toMatch(/<h1>blue – copper<\/h1>/);
    expect(html).toMatch(/Point bas : blue/);
  });

  test("largeur ≥ 3 : le titre est « indéterminé », la fourchette en sous-titre", () => {
    const base = BUILT.get("bohort");
    expect(base).toBeDefined();
    if (!base) return;
    const html = withFourchette(base, "white", "gold");
    expect(html).toMatch(/<h1>Indéterminé<\/h1>/);
    expect(html).toMatch(/Fourchette : white – gold/);
  });

  test("la confiance globale est toujours affichée, quelle que soit la largeur", () => {
    const base = BUILT.get("bohort");
    expect(base).toBeDefined();
    if (!base) return;
    for (const [bas, haut] of [
      ["blue", "blue"],
      ["blue", "copper"],
      ["white", "gold"],
    ] as const) {
      const html = withFourchette(base, bas, haut);
      expect(html).toMatch(/Confiance globale<\/dt><dd>/);
    }
  });

  test("statut « indeterminate » réel (fixtures/synthetic/no-ai-trace) : titre « indéterminé », fourchette White–Gold", () => {
    const built = buildFor("fixtures/synthetic/no-ai-trace", "no-ai-trace-snap");
    expect(built.document.status).toBe("indeterminate");
    expect(built.document.rang_affiche).toBeNull();
    expect(built.html).toMatch(/<h1>Indéterminé<\/h1>/);
    expect(built.html).toMatch(/Fourchette : white – gold/);
    expect(built.html).not.toContain("undefined");
    expect(built.html).not.toContain("null");
    expect(built.html).not.toContain("NaN");
  });
});

// ---------------------------------------------------------------------------
// AC : par axe, marche bloquante + raison chiffrée
// ---------------------------------------------------------------------------

describe("report.html : marche bloquante et raison chiffrée par axe (AC)", () => {
  test("bohort : chaque axe officiel affiche sa marche bloquante et sa raison, mot pour mot depuis le verdict", () => {
    const built = BUILT.get("bohort");
    expect(built).toBeDefined();
    if (!built) return;
    for (const verdict of built.document.verdicts) {
      if (verdict.marche_bloquante === undefined) continue;
      expect(built.html).toContain(`Marche bloquante : ${verdict.marche_bloquante}`);
      expect(built.html).toContain(esc(verdict.raison));
    }
  });
});

// ---------------------------------------------------------------------------
// AC : cartes de marches — état, chemins de preuve + statut, seuil, Evidence, lien
// ---------------------------------------------------------------------------

describe("report.html : cartes de marches complètes (AC)", () => {
  test("bohort : les 24 marches (4 axes officiels + Ownership) ont une carte avec état et lien de fiche", () => {
    const built = BUILT.get("bohort");
    expect(built).toBeDefined();
    if (!built) return;
    for (const axis of built.referentiel.axes) {
      for (const marche of axis.marches) {
        expect(built.html).toContain(`id="marche-${marche.id}"`);
        // Lien de fiche réel (`concepts.json`) : un `href="docs/referentiel.md#<marche>"`
        // relatif au fichier `report.html` serait un lien mort, `docs/` n'étant
        // jamais copié à côté de `report.html` dans `recognaize-cli-out/<sujet>/`.
        // Le lien doit donc être une ancre SUR LA MÊME PAGE, vérifiée résoudre
        // réellement ci-dessous.
        expect(built.html).toContain(`href="#concept-${marche.id.toLowerCase()}"`);
      }
    }
  });

  // Vérifie non seulement que le `href` a la BONNE FORME (test ci-dessus)
  // mais que l'ancre ciblée existe RÉELLEMENT dans le MÊME document généré —
  // un lien syntaxiquement valide dont la cible n'existe nulle part dans le
  // dossier de sortie ne peut être détecté que par cette résolution, jamais
  // par une inspection du dépôt source (`docs/referentiel.md` existe bien là,
  // mais n'est jamais copié dans `recognaize-cli-out/<sujet>/`).
  test("bohort : chaque lien de concept (`href=\"#concept-...\"`) résout vers une ancre `id=\"concept-...\"` réellement présente dans CE MÊME report.html — jamais un fichier externe au dossier de sortie", () => {
    const built = BUILT.get("bohort");
    expect(built).toBeDefined();
    if (!built) return;

    const hrefIds = [...built.html.matchAll(/href="#(concept-[a-z0-9]+)"/g)].map((m) => m[1]);
    expect(hrefIds.length).toBeGreaterThan(0);

    const anchorIds = new Set([...built.html.matchAll(/\sid="(concept-[a-z0-9]+)"/g)].map((m) => m[1]));
    for (const hrefId of hrefIds) {
      expect(anchorIds.has(hrefId), `href="#${hrefId}" ne résout vers aucune ancre id="${hrefId}" dans ce report.html`).toBe(true);
    }

    // Aucun lien de concept ne pointe plus jamais vers un fichier externe
    // (`docs/referentiel.md`) — la classe de bug d'origine ne peut plus se
    // reproduire structurellement (l'annexe est inline, dans le même document).
    expect(built.html).not.toContain("docs/referentiel.md");
  });

  test("bohort : au moins une Evidence citée porte son statut (preuve/contre-preuve) et sa citation échappée", () => {
    const built = BUILT.get("bohort");
    expect(built).toBeDefined();
    if (!built) return;
    const withCitation = built.document.evidence.find((item) => item.citation !== undefined && item.citation.length > 0);
    expect(withCitation).toBeDefined();
    if (!withCitation?.citation) return;
    expect(built.html).toContain(esc(withCitation.citation));
  });
});

// ---------------------------------------------------------------------------
// AC : « ce qui manque pour trancher »
// ---------------------------------------------------------------------------

describe("report.html : « ce qui manque pour trancher » nomme les pièces absentes des axes inconnus (AC)", () => {
  test("perceval : au moins une marche inconnue existe et sa section nomme un signal/source absent", () => {
    const built = BUILT.get("perceval");
    expect(built).toBeDefined();
    if (!built) return;

    const hasUnknown = built.document.axes.some((axis) => axis.etats.some((entry) => entry.etat === "inconnu"));
    expect(hasUnknown).toBe(true);
    expect(built.html).toContain("Ce qui manque pour trancher");
    expect(built.html).toMatch(/signal <code>/);
  });

  // Sur un profil `status === "indeterminate"`, chaque axe a `etats: []`
  // (aucune marche jugée, aucune Evidence nulle part — voir
  // `core/judge.ts`.`indeterminateResult`). `renderMissingSection` ne doit
  // jamais retomber dans la branche « tout est prouvé » et afficher « Aucune
  // marche inconnue : chaque marche (…) dispose d'au moins une preuve » —
  // affirmation directement contredite par le statut et par 0 carte de marche
  // rendue ailleurs sur la même page. Le texte honnête doit apparaître, le
  // texte trompeur ne doit JAMAIS apparaître sur ce profil.
  test("no-ai-trace (status indeterminate) : le rapport dit honnêtement qu'aucune marche n'a été jugée, jamais qu'elles sont toutes prouvées", () => {
    const built = BUILT.get("no-ai-trace");
    expect(built).toBeDefined();
    if (!built) return;

    expect(built.document.status).toBe("indeterminate");
    // Le juge force `etats: []` sur chaque axe (`core/judge.ts`.`indeterminateResult`)
    // dès que `hasAiUsageProof` est faux, quel que soit le volume d'Evidence
    // par ailleurs calculé par les checks (`document.evidence` peut rester non
    // vide : les checks tournent indépendamment du statut, seul le VERDICT du
    // juge est figé à « indéterminé ») — c'est cette absence de marche jugée,
    // pas une absence d'Evidence, que la section doit refléter honnêtement.
    for (const axis of built.document.axes) {
      expect(axis.etats).toEqual([]);
    }

    expect(built.html).toContain("Ce qui manque pour trancher");
    expect(built.html).toMatch(/Statut indéterminé\s*:\s*aucune preuve d'usage de l'IA n'a été trouvée dans ce profil/);
    expect(built.html).toMatch(/Aucune marche n'a pu être jugée/);
    expect(built.html).not.toContain(
      "Aucune marche inconnue : chaque marche de chaque axe dispose d'au moins une preuve, un indice ou une contre-preuve.",
    );

    expect(built.html).not.toContain("undefined");
    expect(built.html).not.toContain("null");
    expect(built.html).not.toContain("NaN");
  });
});

// ---------------------------------------------------------------------------
// AC : badge qualité, miroir, incohérences présents sur un profil complet
// ---------------------------------------------------------------------------

describe("report.html : badge qualité, miroir et incohérences présents (bohort, profil complet) (AC)", () => {
  test("bohort : les trois sections sont présentes et le badge qualité n'affecte ni rang ni fourchette ni confiance", () => {
    const built = BUILT.get("bohort");
    expect(built).toBeDefined();
    if (!built) return;

    expect(built.html).toContain("Qualité du code");
    expect(built.html).toContain("Miroir : déclaré vs observé");
    expect(built.html).toContain("Incohérences");
    // Réponse déclarative de bohort (fixtures/profiles/bohort/declaratif.md) : « Difficile à
    // dire […] milieu de tableau » doit apparaître, échappée, dans le miroir.
    expect(built.extras.declaratif?.selfEstimatedLevel).toBeDefined();
    if (built.extras.declaratif?.selfEstimatedLevel) {
      expect(built.html).toContain(esc(built.extras.declaratif.selfEstimatedLevel));
    }
  });

  test("le badge qualité ne modifie jamais rang_affiche/fourchette/confiance_globale (aucun import de quality-badge par le juge)", () => {
    const built = BUILT.get("bohort");
    expect(built).toBeDefined();
    if (!built) return;
    // Recalculer avec des mesures qualité extrêmement dégradées ne doit rien
    // changer au verdict déjà figé dans `document` — seul le badge affiché change.
    const degraded: ReportExtras = {
      ...built.extras,
      sonarMeasures: { measures: { bugs: 999, duplicated_lines_density: 99 } },
      gitActivity: { ...built.extras.gitActivity, tests: { coverage_start: 0.9, coverage_end: 0.1 }, ci: { failure_rate: 0.9 } },
    };
    const htmlDegraded = buildReportHtml(built.document, built.referentiel, degraded);
    expect(htmlDegraded).toContain(`Rang affiché</dt><dd>${built.document.rang_affiche}</dd>`);
    expect(htmlDegraded).toContain("Rouge");
  });
});

// ---------------------------------------------------------------------------
// Déterminisme : deux constructions du même profil -> HTML byte-identique
// ---------------------------------------------------------------------------

describe("report.html : déterminisme (AC — mêmes garanties que result.json)", () => {
  test("bohort : deux runs indépendants produisent un report.html byte-identique", () => {
    const first = buildFor("fixtures/profiles/bohort", "bohort-determinism");
    const second = buildFor("fixtures/profiles/bohort", "bohort-determinism");
    expect(first.html).toBe(second.html);
  });

  test("hostile : deux runs indépendants produisent un report.html byte-identique", () => {
    const first = buildFor("fixtures/hostile", "hostile-determinism");
    const second = buildFor("fixtures/hostile", "hostile-determinism");
    expect(first.html).toBe(second.html);
  });
});

// ---------------------------------------------------------------------------
// Coup d'œil : radar 5 axes. Un label d'axe peut dépasser le bord du viewBox
// (mesuré via `getBBox()` dans un vrai navigateur — invisible à l'œil sur une
// simple capture). Ce test ne peut pas rejouer `getBBox()` (pas de moteur de
// rendu ici), mais reproduit le même calcul géométrique que
// `renderRadarChart` pour garantir qu'aucun `<text>` n'a son point d'ancrage
// trop près du bord du viewBox pour une marge de texte réaliste — toute
// régression de `size`, `maxRadius` ou `labelRadius` sans ajustement conjoint
// est détectée ici, jamais seulement à l'œil sur un profil au hasard.
// ---------------------------------------------------------------------------

describe("report.html : radar 5 axes — pas de label collé au bord du viewBox (AC, régression H/O 2026-08-30)", () => {
  test.for(FIXTURES)("$name : viewBox du radar, 5 points, tous les labels avec une marge de sécurité", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";

    const viewBoxMatch = /class="radar-chart" viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(html);
    expect(viewBoxMatch).not.toBeNull();
    const width = Number(viewBoxMatch?.[1]);
    const height = Number(viewBoxMatch?.[2]);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);

    const labelMatches = [...html.matchAll(/<text x="(-?\d+(?:\.\d+)?)" y="(-?\d+(?:\.\d+)?)" text-anchor="(start|end|middle)" class="radar-label">/g)];
    expect(labelMatches).toHaveLength(5); // T, H, I, P, O — toujours 5, quel que soit le profil.

    // Marge de sécurité pour un libellé réaliste (« H — H3 », ~6-7 caractères à 12px ≈ 45-50px de large).
    const SAFE_MARGIN = 40;
    for (const [, xRaw, yRaw] of labelMatches) {
      const x = Number(xRaw);
      const y = Number(yRaw);
      expect(x).toBeGreaterThanOrEqual(SAFE_MARGIN);
      expect(x).toBeLessThanOrEqual(width - SAFE_MARGIN);
      expect(y).toBeGreaterThanOrEqual(SAFE_MARGIN);
      expect(y).toBeLessThanOrEqual(height - SAFE_MARGIN);
    }
  });
});

// ---------------------------------------------------------------------------
// Coup d'œil : divulgation progressive — détail technique replié par défaut,
// jamais un code de marche nu sans son libellé dans le résumé en clair (AC).
// ---------------------------------------------------------------------------

describe("report.html : divulgation progressive (AC)", () => {
  test.for(FIXTURES)("$name : la section « Coup d'œil » existe, avant les cartes techniques", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    const glanceIndex = html.indexOf('class="glance-section"');
    const axisCardsIndex = html.indexOf('class="axis-section"');
    expect(glanceIndex).toBeGreaterThan(-1);
    expect(axisCardsIndex).toBeGreaterThan(-1);
    expect(glanceIndex).toBeLessThan(axisCardsIndex);
  });

  test.for(FIXTURES)("$name : chaque détail technique par axe est replié par défaut (pas d'attribut open)", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    const detailsBlocks = [...html.matchAll(/<details class="axis-detail"( open)?>/g)];
    expect(detailsBlocks.length).toBeGreaterThan(0);
    for (const [, openAttr] of detailsBlocks) {
      expect(openAttr).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Sélecteur d'axe : 5 onglets CSS purs (T/H/I/P/O), jamais de <script> —
// clic et flèches clavier natives sur le groupe de radios, exclusivité de
// l'onglet visible, panneau de signaux mis à jour. Ce test ne peut pas
// rejouer l'interaction (pas de moteur de rendu ici) mais verrouille la
// STRUCTURE dont dépend cette interaction — 5 radios, 5 labels assortis,
// 5 panneaux, jamais moins.
// ---------------------------------------------------------------------------

describe("report.html : sélecteur d'axe — 5 onglets T/H/I/P/O, structure radio/label/panel cohérente (AC)", () => {
  test.for(FIXTURES)("$name : 5 radios, 5 labels, 5 panneaux, IDs assortis", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";

    const radioIds = [...html.matchAll(/<input type="radio" name="axis-tab" id="tab-([THIPO])" class="axis-tab-input"( checked)?>/g)].map((m) => m[1]);
    expect(radioIds).toEqual(["T", "H", "I", "P", "O"]);

    const labelFors = [...html.matchAll(/<label for="tab-([THIPO])" class="axis-tab-label">/g)].map((m) => m[1]);
    expect(labelFors).toEqual(["T", "H", "I", "P", "O"]);

    const panelAxes = [...html.matchAll(/<div class="axis-panel" data-axis="([THIPO])">/g)].map((m) => m[1]);
    expect(panelAxes).toEqual(["T", "H", "I", "P", "O"]);

    // Exactement un seul radio porte `checked` (l'onglet T, ouvert par défaut) — jamais zéro, jamais deux.
    const checkedCount = (html.match(/class="axis-tab-input" checked>/g) ?? []).length;
    expect(checkedCount).toBe(1);
    expect(html).toContain('<input type="radio" name="axis-tab" id="tab-T" class="axis-tab-input" checked>');
  });

  test.for(FIXTURES)("$name : encart « Jargon » présent avec les 7 sources", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    expect(html).toContain('class="glossary-sidebar"');
    for (const source of ["GA", "RC", "PR", "SO", "S", "SU", "DEC"]) {
      expect(html).toContain(`<code>${source}</code>`);
    }
  });

  test.for(FIXTURES)("$name : plus d'encart « Signaux observés » par axe (retiré le 2026-08-31, redondant avec le contenu central)", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    expect(html).not.toContain('class="axis-panel-signals"');
    expect(html).not.toContain("Signaux observés");
    // Le panneau d'axe n'a plus qu'une seule colonne — plus de sous-wrapper `axis-panel-main`.
    expect(html).not.toContain('class="axis-panel-main"');
  });
});

// ---------------------------------------------------------------------------
// Encarts latéraux gauche : « Abréviations des sources » et « Force d'une
// preuve » sont 2 cases séparées, repliables ENSEMBLE via une seule case à
// cocher CSS, jamais indépendamment l'une de l'autre.
// ---------------------------------------------------------------------------

describe("report.html : encarts latéraux gauche — 2 cases séparées, repliables ensemble (AC, 2026-08-31)", () => {
  test.for(FIXTURES)("$name : glossaire des sources et « Force d'une preuve » sont 2 <aside> distincts", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    expect(html).toContain('<aside class="glossary-sidebar"');
    expect(html).toContain('<aside class="force-glossary-sidebar"');
    // La section « Force d'une preuve » ne doit plus être un sous-titre DANS le glossaire des sources.
    const sourcesAsideMatch = /<aside class="glossary-sidebar"[\s\S]*?<\/aside>/.exec(html);
    expect(sourcesAsideMatch).not.toBeNull();
    expect(sourcesAsideMatch?.[0]).not.toContain("Force d'une preuve");
  });

  test.for(FIXTURES)("$name : une seule case à cocher pilote le repli des 2 encarts ensemble", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    const toggleCount = (html.match(/id="sidebar-toggle"/g) ?? []).length;
    expect(toggleCount).toBe(1);
    // Les 2 <aside> vivent tous les deux DANS le même conteneur .sidebar-stack, piloté par cette case unique.
    const stackMatch = /<div class="sidebar-stack">[\s\S]*?<\/div>\s*<div class="axes-main">/.exec(html);
    expect(stackMatch).not.toBeNull();
    expect(stackMatch?.[0]).toContain('class="glossary-sidebar"');
    expect(stackMatch?.[0]).toContain('class="force-glossary-sidebar"');
    // Un bouton pour réduire (dans la pile) et un pour ré-afficher (hors de la pile, visible seulement replié).
    expect(html).toContain('class="sidebar-toggle-label"');
    expect(html).toContain('class="sidebar-expand-label"');
  });

  test.for(FIXTURES)("$name : .axes-main contient TOUT le reste — sélecteur d'axe, manques, miroir, qualité, incohérences, annexe — pour que le sticky les couvre tous", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    const mainMatch = /<div class="axes-main">([\s\S]*)<\/div>\s*<\/div>\s*<\/main>/.exec(html);
    expect(mainMatch).not.toBeNull();
    const mainContent = mainMatch?.[1] ?? "";
    expect(mainContent).toContain('class="axis-switcher"');
    expect(mainContent).toContain('class="missing-section"');
    expect(mainContent).toContain('class="quality-section"');
  });
});

// ---------------------------------------------------------------------------
// Sources : abréviation seule (jamais le nom de fichier complet) partout hors
// de l'encart « Abréviations des sources de données ».
// ---------------------------------------------------------------------------

describe("report.html : sources — abréviation seule hors de l'encart de gauche (AC)", () => {
  test.for(FIXTURES)("$name : les étiquettes de source (evidence-source, path-desc) affichent l'abréviation seule", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    const glossaryMatch = /<aside class="glossary-sidebar"[\s\S]*?<\/aside>/.exec(html);
    expect(glossaryMatch).not.toBeNull();
    const withoutGlossary = html.replace(glossaryMatch?.[0] ?? "", "");
    // Les étiquettes de source dédiées (pas les citations libres de preuve, qui
    // peuvent légitimement nommer un fichier absent pour expliquer une approximation
    // — ex. "approximation : pull-requests.json absent, dénominateur = …") doivent
    // toutes afficher l'abréviation seule, jamais le nom de fichier complet.
    const labelPattern = /<span class="evidence-source">([^<]+)<\/span>/g;
    for (const match of withoutGlossary.matchAll(labelPattern)) {
      const label = match[1];
      for (const filename of ["git-activity.json", "pull-requests.json", "sonar-measures.json", "session.md", "declaratif.md"]) {
        expect(label).not.toContain(filename);
      }
    }
  });

  test.for(FIXTURES)("$name : encart « Sources de données », pas de sous-titre « Sources »", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    expect(html).toContain("Sources de données");
    expect(html).not.toContain("Abréviations des sources de données");
    expect(html).not.toContain("Jargon");
    expect(html).not.toContain("<h3>Sources</h3>");
  });
});

// ---------------------------------------------------------------------------
// Sources : classées par ordre de précédence (confiance_source décroissante,
// référentiel — jamais un ordre en dur), avec une note qui le précise.
// ---------------------------------------------------------------------------

describe("report.html : sources classées par ordre de précédence (AC, 2026-08-31)", () => {
  test.for(FIXTURES)("$name : note de précédence présente, ordre = confiance_source décroissante", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    expect(html).toContain("Classées ci-dessous par ordre de précédence");
    const glossaryMatch = /<aside class="glossary-sidebar"[\s\S]*?<\/aside>/.exec(html);
    expect(glossaryMatch).not.toBeNull();
    const codes = [...(glossaryMatch?.[0] ?? "").matchAll(/<li><code>([A-Z]+)<\/code>/g)].map((m) => m[1]);
    expect(codes).toEqual(["GA", "RC", "PR", "SO", "S", "SU", "DEC"]);
  });
});

// ---------------------------------------------------------------------------
// Icône de polarité ✓/✗/– sur chaque preuve/contre-preuve/chemin non observé
// — remplace le texte seul, sans retirer la citation brute.
// ---------------------------------------------------------------------------

describe("report.html : icône de polarité sur les preuves (AC, 2026-08-31)", () => {
  test("bohort : au moins une icône preuve et une citation en <code> juste en dessous", () => {
    const built = BUILT.get("bohort");
    const html = built?.html ?? "";
    expect(html).toContain('class="evidence-icon evidence-icon--preuve"');
    expect(html).toMatch(/<code class="evidence-citation">[^<]+<\/code>/);
  });

  test.for(FIXTURES)("$name : chaque evidence-item porte une icône de la même polarité que sa classe", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    const items = [...html.matchAll(/<li class="evidence-item evidence-item--(preuve|contre-preuve)">([\s\S]*?)<\/li>/g)];
    for (const [, polarite, body] of items) {
      expect(body).toContain(`class="evidence-icon evidence-icon--${polarite}"`);
    }
  });

  test.for(FIXTURES)("$name : chaque chemin de preuve non observé porte une icône neutre", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";
    const absentPaths = [...html.matchAll(/<li class="proof-path proof-path--absent">([\s\S]*?)<\/li>/g)];
    for (const [, body] of absentPaths) {
      expect(body).toContain('class="evidence-icon evidence-icon--absent"');
    }
  });
});

// ---------------------------------------------------------------------------
// En-tête graphique : échelle White→Gold + jauge de confiance. Le texte
// « trouvée nulle part » contient littéralement la sous-chaîne interdite
// "null" (dans "nulle") — piège pour le test « jamais de undefined/null/NaN
// visible » plus haut, à garder en tête si ce texte est modifié.
// ---------------------------------------------------------------------------

describe("report.html : en-tête graphique — échelle des rangs et jauge de confiance (AC)", () => {
  test.for(FIXTURES)("$name : 7 segments de rang, une fourchette et (si rang affiché) un marqueur cohérents", ({ name }) => {
    const built = BUILT.get(name);
    const html = built?.html ?? "";

    const segments = [...html.matchAll(/<div class="rank-ladder__segment" style="background:[^"]+">([^<]+)<\/div>/g)].map((m) => m[1]);
    expect(segments).toEqual(["White", "Red", "Blue", "Green", "Copper", "Silver", "Gold"]);

    const fourchetteMatch = /<div class="rank-ladder__fourchette" style="left:(-?[\d.]+)%; width:([\d.]+)%">/.exec(html);
    expect(fourchetteMatch).not.toBeNull();
    const left = Number(fourchetteMatch?.[1]);
    const width = Number(fourchetteMatch?.[2]);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left).toBeLessThan(100);
    expect(width).toBeGreaterThan(0);
    expect(left + width).toBeLessThanOrEqual(100.01); // tolérance d'arrondi

    // Marqueur présent si et seulement si un rang est réellement affiché (jamais pour "indeterminate").
    const hasMarker = html.includes('class="rank-ladder__marker"');
    expect(hasMarker).toBe(built?.document.rang_affiche !== null);

    const gaugeMatch = /<span class="confidence-gauge__label">(\d+)%<\/span>/.exec(html);
    expect(gaugeMatch).not.toBeNull();
    const gaugePercent = Number(gaugeMatch?.[1]);
    expect(gaugePercent).toBeGreaterThanOrEqual(0);
    expect(gaugePercent).toBeLessThanOrEqual(100);
    expect(gaugePercent).toBe(Math.round((built?.document.confiance_globale ?? 0) * 100));
  });
});
