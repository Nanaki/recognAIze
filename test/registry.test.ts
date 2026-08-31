// Registre et isolation des checks. Ce fichier travaille avec des objets
// `Check` synthétiques — jamais un fichier de `checks/`, jamais `src/packs.ts` réel —
// pour prouver la mécanique générique de `core/registry.ts` indépendamment de
// tout check réel.
//
// Utilise le référentiel réel (`loadReferentiel()`) uniquement comme source de
// `path_id` valides/invalides à référencer depuis les checks synthétiques.

import { ESLint } from "eslint";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { loadReferentiel } from "../src/core/referentiel.js";
import {
  buildRegistry,
  RegistryInvalideError,
  runCheck,
  type DiscoveredCheckFile,
} from "../src/core/registry.js";
import type { Check, Evidence, ProfileContext } from "../src/core/types.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const { referentiel } = loadReferentiel();

const FAKE_CONTEXT: ProfileContext = { profileId: "synthetic-profile", warnings: [] };

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "ev-synthetic-1",
    signal_id: "GA.size_median",
    valeur: { type: "enum", unite: "taille_bucket" },
    source: "GA",
    check_id: "synthetic.check",
    path_id: "T2.p1",
    concept_id: "taille",
    axe: "T",
    polarite: "preuve",
    force: "prouve",
    confiance_source: 1,
    ...overrides,
  };
}

interface MakeCheckOptions {
  readonly id: string;
  readonly axe: Check["axe"];
  readonly marche: string;
  readonly path_ids: readonly string[];
  readonly sources?: Check["sources"];
  readonly pack?: string;
  readonly enabled?: boolean;
  readonly run?: Check["run"];
}

function makeCheck(options: MakeCheckOptions): Check {
  return {
    id: options.id,
    axe: options.axe,
    marche: options.marche,
    path_ids: options.path_ids,
    sources: options.sources ?? ["GA"],
    pack: options.pack ?? "core-git-activity",
    enabled: options.enabled ?? true,
    run: options.run ?? (() => []),
  };
}

describe("buildRegistry — validation des path_id", () => {
  test("un check déclarant un path_id absent du référentiel fait échouer buildRegistry, en nommant le check et le path_id", () => {
    const badCheck = makeCheck({ id: "synthetic.bad-path", axe: "T", marche: "Z9", path_ids: ["Z9.p1"] });

    let thrown: unknown;
    try {
      buildRegistry(referentiel, [badCheck]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RegistryInvalideError);
    const message = (thrown as Error).message;
    expect(message).toContain("synthetic.bad-path");
    expect(message).toContain("Z9.p1");
  });

  test("un path_id couvert par un check n'est pas un avertissement ; les autres path_id de la même marche le restent", () => {
    const coveringCheck = makeCheck({ id: "synthetic.covers-t2p1", axe: "T", marche: "T2", path_ids: ["T2.p1"] });

    const registry = buildRegistry(referentiel, [coveringCheck]);

    expect(registry.warnings.some((warning) => warning.includes("T2.p1"))).toBe(false);
    expect(registry.warnings.some((warning) => warning.includes("T2.p2"))).toBe(true);
    expect(registry.warnings.some((warning) => warning.includes("T2.p3"))).toBe(true);
  });

  test("un path_id sans aucun check produit un avertissement listé, jamais une erreur", () => {
    expect(() => buildRegistry(referentiel, [])).not.toThrow();

    const registry = buildRegistry(referentiel, []);
    expect(registry.warnings.length).toBeGreaterThan(0);
    expect(registry.warnings.some((warning) => warning.includes("T2.p1"))).toBe(true);
  });
});

describe("runCheck — isolation", () => {
  test("un check qui lève produit {unknown: true, warning} ; les autres checks du même pack s'exécutent toujours", () => {
    const throwingCheck = makeCheck({
      id: "synthetic.throws",
      axe: "T",
      marche: "T2",
      path_ids: ["T2.p1"],
      pack: "core-git-activity",
      run: () => {
        throw new Error("boom synthétique");
      },
    });
    const siblingCheck = makeCheck({
      id: "synthetic.ok-sibling",
      axe: "T",
      marche: "T2",
      path_ids: ["T2.p2"],
      pack: "core-git-activity",
      run: () => [makeEvidence({ check_id: "synthetic.ok-sibling", path_id: "T2.p2" })],
    });

    // Le pack synthétique contient les deux : buildRegistry ne doit pas non plus
    // planter parce que l'un des deux checks (une fois exécuté) lèverait.
    const registry = buildRegistry(referentiel, [throwingCheck, siblingCheck]);
    expect(registry.checks).toHaveLength(2);

    const throwOutcome = runCheck(throwingCheck, FAKE_CONTEXT, referentiel);
    const siblingOutcome = runCheck(siblingCheck, FAKE_CONTEXT, referentiel);

    expect(Array.isArray(throwOutcome)).toBe(false);
    expect(throwOutcome).toMatchObject({ unknown: true });
    const throwWarning = (throwOutcome as { readonly warning: string }).warning;
    expect(throwWarning).toContain("synthetic.throws");
    expect(throwWarning).toContain("boom synthétique");

    expect(Array.isArray(siblingOutcome)).toBe(true);
    expect(siblingOutcome).toHaveLength(1);
  });

  test("un check désactivé rend ses path_id inconnus, jamais absents — evidence + inconnus = taille du registre", () => {
    const enabledOk = makeCheck({
      id: "synthetic.enabled-ok",
      axe: "T",
      marche: "T2",
      path_ids: ["T2.p1"],
      run: () => [makeEvidence({ check_id: "synthetic.enabled-ok", path_id: "T2.p1" })],
    });
    const enabledThrows = makeCheck({
      id: "synthetic.enabled-throws",
      axe: "T",
      marche: "T2",
      path_ids: ["T2.p2"],
      run: () => {
        throw new Error("échec synthétique");
      },
    });
    const disabled = makeCheck({
      id: "synthetic.disabled",
      axe: "T",
      marche: "T2",
      path_ids: ["T2.p3"],
      enabled: false,
    });
    // Un check activé qui n'observe rien reste un run réussi (Evidence vide), pas un inconnu.
    const enabledEmptyEvidence = makeCheck({
      id: "synthetic.enabled-empty",
      axe: "T",
      marche: "T3",
      path_ids: ["T3.p1"],
      run: () => [],
    });

    const checks = [enabledOk, enabledThrows, disabled, enabledEmptyEvidence];
    const registry = buildRegistry(referentiel, checks);
    expect(registry.checks).toHaveLength(checks.length);

    let evidenceOutcomes = 0;
    let inconnus = 0;
    for (const check of registry.checks) {
      const outcome = runCheck(check, FAKE_CONTEXT, referentiel);
      if ("unknown" in outcome) {
        expect(outcome.unknown).toBe(true);
        inconnus += 1;
      } else {
        evidenceOutcomes += 1;
      }
    }

    expect(evidenceOutcomes + inconnus).toBe(registry.checks.length);
    expect(inconnus).toBe(2); // enabledThrows + disabled
    expect(evidenceOutcomes).toBe(2); // enabledOk + enabledEmptyEvidence

    const disabledOutcome = runCheck(disabled, FAKE_CONTEXT, referentiel);
    expect(Array.isArray(disabledOutcome)).toBe(false);
    expect(disabledOutcome).toMatchObject({ unknown: true });
  });
});

describe("buildRegistry — fichiers orphelins de src/checks/**", () => {
  test("un fichier découvert dont le check n'est enregistré dans aucun pack fait échouer buildRegistry, en le nommant", () => {
    const registeredCheck = makeCheck({ id: "synthetic.registered", axe: "T", marche: "T2", path_ids: ["T2.p1"] });
    const discovered: DiscoveredCheckFile[] = [
      { file: "core-git-activity/T2.git-activity.ts", checkId: "synthetic.registered" },
      { file: "core-git-activity/orphan.git-activity.ts", checkId: "synthetic.orphan" },
    ];

    let thrown: unknown;
    try {
      buildRegistry(referentiel, [registeredCheck], discovered);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RegistryInvalideError);
    expect((thrown as Error).message).toContain("orphan.git-activity.ts");
  });

  test("un fichier découvert dont le check est bien enregistré ne fait pas échouer buildRegistry", () => {
    const registeredCheck = makeCheck({ id: "synthetic.registered-2", axe: "T", marche: "T2", path_ids: ["T2.p1"] });
    const discovered: DiscoveredCheckFile[] = [
      { file: "core-git-activity/T2.git-activity.ts", checkId: "synthetic.registered-2" },
    ];

    expect(() => buildRegistry(referentiel, [registeredCheck], discovered)).not.toThrow();
  });
});

describe("buildRegistry — tri déterministe", () => {
  test("tri (axe, marche, sources, check_id) par points de code, indépendant de l'ordre d'entrée", () => {
    const lastById = makeCheck({ id: "z.last", axe: "T", marche: "T2", sources: ["PR"], path_ids: [] });
    const firstById = makeCheck({ id: "a.first", axe: "T", marche: "T2", sources: ["GA"], path_ids: [] });
    const otherAxis = makeCheck({ id: "mid", axe: "H", marche: "H2", sources: ["RC"], path_ids: [] });

    const orderOne = buildRegistry(referentiel, [lastById, firstById, otherAxis]);
    const orderTwo = buildRegistry(referentiel, [otherAxis, lastById, firstById]);

    expect(orderOne.checks.map((check) => check.id)).toEqual(["mid", "a.first", "z.last"]);
    expect(orderOne.checks.map((check) => check.id)).toEqual(orderTwo.checks.map((check) => check.id));
    expect(JSON.stringify(orderOne)).toBe(JSON.stringify(orderTwo));
  });

  test("checks list (buildRegistry sur le registre réel encore vide) est byte-identique sur deux exécutions successives", () => {
    const first = buildRegistry(referentiel, [], []);
    const second = buildRegistry(referentiel, [], []);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("frontière ESLint core/ ⇏ checks/ (Part 1, re-confirmée en phase 2)", () => {
  test("ESLint échoue si src/core/** importe src/checks/**", async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const virtualFilePath = join(REPO_ROOT, "src", "core", "__eslint-boundary-check.ts");
    const violatingSource = [
      'import { DISCOVERED_CHECKS } from "../checks/index.js";',
      "",
      "export const leaked = DISCOVERED_CHECKS;",
      "",
    ].join("\n");

    const results = await eslint.lintText(violatingSource, { filePath: virtualFilePath });
    const messages = results.flatMap((result) => result.messages);

    expect(messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(true);
  });
});
