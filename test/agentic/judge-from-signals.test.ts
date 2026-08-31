/**
 * Test du pont agentique -> juge (scripts/agentic/judge-from-signals.ts).
 * Ne teste PAS l'extraction LLM (aucun oracle automatisable pour ça) : teste
 * seulement que le pont convertit correctement un dictionnaire
 * signal_id -> valeur en Evidence[] via evaluateProofPathDefault, puis en
 * verdict via judge() — la seule partie de ce prototype qui est mécanique et
 * donc testable en dur.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const scriptPath = join(repoRoot, "scripts", "agentic", "judge-from-signals.ts");

interface BridgeResult {
  readonly rang_affiche: string | null;
  readonly warnings: readonly string[];
  readonly axes: ReadonlyArray<{ readonly axe: string; readonly etats: ReadonlyArray<{ readonly marche: string; readonly etat: string }> }>;
}

interface BridgeEvidence {
  readonly id: string;
  readonly axe: string;
  readonly path_id: string;
  readonly source: string;
  readonly check_id: string;
}

function runBridge(signals: Record<string, unknown>): { result: BridgeResult; evidence_count: number; evidence: readonly BridgeEvidence[] } {
  const out = execFileSync("npx", ["tsx", scriptPath], {
    cwd: repoRoot,
    input: JSON.stringify({ signals }),
    encoding: "utf8",
  });
  return JSON.parse(out);
}

describe("scripts/agentic/judge-from-signals.ts", () => {
  it("aucun signal -> aucune preuve d'usage IA -> indeterminate", () => {
    const { result } = runBridge({});
    expect(result.rang_affiche).toBeNull();
  });

  it("un seul signal d'usage IA -> White franchi, marches par défaut -> Red", () => {
    const { result } = runBridge({ "GA.ai_coauthored_ratio": 0.3 });
    expect(result.rang_affiche).toBe("red");
  });

  it("signaux Taille+Harness+Intervention cohérents avec Blue -> blue", () => {
    const { result } = runBridge({
      "GA.ai_coauthored_ratio": 0.58,
      "GA.size_median": "M",
      "PR.median_files_changed": 8,
      "GA.agents_md": true,
      "GA.agents_md_last_updated_in_window": true,
      "GA.rules_skills_agents_count": 0,
      "RC.behavior_artifacts_specific_count": 0,
      "GA.median_correction_commits_after_open": 2,
    });
    expect(result.rang_affiche).toBe("blue");
  });

  it("un path_id inconnu (marche jamais évaluée) ne fait jamais planter le pont", () => {
    expect(() => runBridge({ "GA.ai_coauthored_ratio": 1, "ZZ.nonexistent_signal": 42 })).not.toThrow();
  });

  it("T2/T3 voie PR ne contre-prouve jamais, même si les valeurs PR sont hors fenêtre (régression 'arthur')", () => {
    // GA.size_median="L" prouve T2.p1 et T3.p1. PR.median_files_changed/lines_changed très
    // au-dessus de la fenêtre M (5-12/150-500) : une négation complète générique infirmerait
    // T2.p2 à tort, qui écraserait par précédence de source (PR > GA) la preuve GA légitime
    // (T2.p2 hérite la précédence PR même si sa contre-preuve est illégitime) — repéré en
    // direct sur le profil "arthur" (médiane réelle 29 fichiers/1050 lignes), où la version
    // précédente du pont plafonnait tout l'axe T à T1 par incohérence T2 infirmé / T3-T4 prouvés.
    const { result } = runBridge({
      "GA.ai_coauthored_ratio": 0.9,
      "GA.size_median": "L",
      "PR.median_files_changed": 29,
      "PR.median_lines_changed": 1050,
    });
    const axeT = result.axes.find((a) => a.axe === "T");
    expect(axeT?.etats.find((e) => e.marche === "T2")?.etat).toBe("prouvé");
    expect(axeT?.etats.find((e) => e.marche === "T3")?.etat).toBe("prouvé");
    expect(result.warnings).toEqual([]);
  });

  it("T4 reste inconnu (pas infirmé) avec un xl_ratio bas mais non nul (régression 'leodagan')", () => {
    // T4.git-activity.ts ne contre-prouve QUE si size_distribution.xl === 0 littéralement
    // ("aucune PR XL"), pas simplement xl_ratio < 20% — un profil avec quelques PR XL mais un
    // ratio sous le seuil (ex. leodagan : 8 PR XL / 71 ≈ 11%) doit rester "inconnu", jamais
    // infirmé par une négation complète générique.
    const { result } = runBridge({ "GA.ai_coauthored_ratio": 0.87, "GA.xl_ratio": 0.1127 });
    const axeT = result.axes.find((a) => a.axe === "T");
    expect(axeT?.etats.find((e) => e.marche === "T4")?.etat).toBe("inconnu");
  });

  it("T4 reste infirmé quand xl_ratio est exactement 0 (aucune PR XL)", () => {
    const { result } = runBridge({ "GA.ai_coauthored_ratio": 0.87, "GA.xl_ratio": 0 });
    const axeT = result.axes.find((a) => a.axe === "T");
    expect(axeT?.etats.find((e) => e.marche === "T4")?.etat).toBe("infirmé");
  });
});

// ---------------------------------------------------------------------------
// `evidence` (en plus de `evidence_count`) : nécessaire à `write-final-report.ts`
// (action 04) pour construire le `document` du mode `export` de la CLI — voir
// `aidd_docs/tasks/2026_08/2026_08_31_agentic-report-html-parity/phase-2.md`.
// ---------------------------------------------------------------------------

describe("scripts/agentic/judge-from-signals.ts : champ evidence (AC, phase 2)", () => {
  it("evidence[] non vide dès qu'un chemin de preuve est déterminable, et sa longueur == evidence_count", () => {
    const { result, evidence, evidence_count } = runBridge({ "GA.ai_coauthored_ratio": 0.58 });
    void result;
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence).toHaveLength(evidence_count);
  });

  it("aucun signal ⇒ evidence[] vide, jamais une entrée inventée", () => {
    const { evidence, evidence_count } = runBridge({});
    expect(evidence).toEqual([]);
    expect(evidence_count).toBe(0);
  });

  it("chaque entrée porte le vocabulaire attendu (axe/path_id/source/check_id), jamais un champ manquant silencieux", () => {
    const { evidence } = runBridge({ "GA.ai_coauthored_ratio": 0.58, "GA.size_median": "M", "PR.median_files_changed": 8 });
    expect(evidence.length).toBeGreaterThan(0);
    for (const entry of evidence) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.axe.length).toBeGreaterThan(0);
      expect(entry.path_id.length).toBeGreaterThan(0);
      expect(entry.check_id).toContain("agentic:");
    }
  });

  it("evidence[] triée déterministe (axe, marche, source, check_id) — même ordre que report/json.ts.sortEvidence", () => {
    const { evidence } = runBridge({
      "GA.ai_coauthored_ratio": 0.58,
      "GA.size_median": "M",
      "PR.median_files_changed": 8,
      "GA.agents_md": true,
    });
    const sortedCopy = [...evidence].sort(
      (a, b) => a.axe.localeCompare(b.axe) || a.path_id.localeCompare(b.path_id) || a.source.localeCompare(b.source) || a.check_id.localeCompare(b.check_id),
    );
    // Comparaison par points de code ASCII simples (axes/ids restent tous en
    // ASCII majuscule) — suffisant pour vérifier l'ordre sans dépendre de
    // `localeCompare`/`Intl` dans ce test lui-même.
    expect(evidence.map((e) => e.id)).toEqual(sortedCopy.map((e) => e.id));
  });
});

// ---------------------------------------------------------------------------
// Déterminisme du pont : `.claude/rules/fiabilite.md` exige « même entrée →
// même result.json » pour le CLI, vérifié par le test hostile-determinism de
// `test/report.snapshot.test.ts` — même garantie requise ici, ce pont
// réutilisant les mêmes fonctions déterministes
// (`evaluateProofPathDefault`, `judge()`).
// ---------------------------------------------------------------------------

describe("scripts/agentic/judge-from-signals.ts : déterminisme (AC, 2026-08-31)", () => {
  const RICH_SIGNALS = {
    "GA.ai_coauthored_ratio": 0.58,
    "GA.size_median": "M",
    "PR.median_files_changed": 8,
    "GA.agents_md": true,
    "GA.agents_md_last_updated_in_window": true,
    "GA.median_concurrent_branches": 3,
    "GA.xl_ratio": 0.05,
  };

  it("mêmes signaux, deux exécutions → sortie strictement identique (même entrée -> même sortie)", () => {
    const first = runBridge(RICH_SIGNALS);
    const second = runBridge(RICH_SIGNALS);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("mêmes signaux dans un ORDRE DE CLÉS différent -> sortie identique (indépendance à l'ordre de l'objet JSON d'entrée)", () => {
    const reversed = Object.fromEntries([...Object.entries(RICH_SIGNALS)].reverse());
    const inOrder = runBridge(RICH_SIGNALS);
    const outOfOrder = runBridge(reversed);
    expect(JSON.stringify(outOfOrder)).toBe(JSON.stringify(inOrder));
  });
});
