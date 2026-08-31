---
name: testing
description: Testing strategy and guidelines
argument-hint: N/A
scope: all
---

# Testing Guidelines

> État : réel, vérifié contre le dépôt. 1375 tests verts (`npm test` : 1351
> sur le chemin déterministe, dont le mode `export` de la CLI (§ Chemin
> agentique) + `npm test test/agentic/` : 24 sur le pont agentique et le
> rapport final agentique), `npm run eval` 4/4 rang exact.

La fiabilité prime sur le délai (DEC-001, `ADR.md`) ; exit 1 est un défaut.

## Test Coverage (optional)

- Pas de pourcentage cible : chaque check a un test table-driven, chaque source un contract test, le juge des property tests ; toute fonctionnalité sans test est retirée avant le rendu.

## Tools and Frameworks

- `vitest` (unitaires, contract, golden, snapshots, e2e), `fast-check` (property-based), fuzzer maison `scripts/fuzz-profile.ts`, runner d'eval `npm run eval`.

## Testing Strategy

- Ordre d'écriture : e2e « chemin jury » d'abord, puis juge (property) sur un référentiel jouet, puis checks, sources, golden/snapshots, fuzzer, evals.
- Types de tests :
  - Unit : un test par check `test/checks/<marche>.<source>.test.ts` (champ absent, null, 0, seuil exact, seuil − 1) ; `medianFromBuckets`, digest de session.
  - Property (juge) : monotonie (retirer une Evidence ne fait jamais monter le rang ponctuel), invariance par permutation, idempotence, aucune marche prouvée au-dessus d'une infirmée, rang prouvé ≤ ponctuel ≤ haut de fourchette, rabais Ownership ≤ 1.
  - Contract (sources) : JSON invalide, tableau vs objet, null, BOM/UTF-16, fichier de 3 Mo, symlink sortant, champ inconnu → pièce absente + avertissement, jamais d'exception.
  - Golden : `test/golden/<profil>.result.json` par étalon ; snapshot HTML par étalon + profil hostile ; test d'absence de `undefined`/`null`/`NaN`.
  - Eval : 4/4 rang exact (Ownership on/off), fixtures négatives (arthur/H6, leodagan/H6, leodagan/I4, leodagan/P3, bohort/H4), ablation (rang ponctuel non croissant, attendu ∈ fourchette, confiance non croissante ou `indeterminate`), hold-out ≥ 3 mutants datés par git, fuzzer 200 mutants (exit ∈ {0, 2}, invariants), anti-richesse, anti-littéral, `path_id` orphelins, déterminisme (deux exécutions identiques hors horodatage).
  - E2E : clone local → `npm ci --ignore-scripts` → `npm run build` → `node dist/cli.js analyze` sur 4 étalons + 1 profil mutilé + 1 dossier vide ; codes de sortie, `result.json` valides, rangs attendus.
- Invariants runtime (avertissement en CLI, échec en test) : résultat produit ou exit 2 ; `bas ≤ haut` ; rang ⇒ fourchette et confiance ; ids d'Evidence uniques ; seuil pour tout `path_id` ; `evidence + inconnus = registre` ; `0 ≤ confiance ≤ 1`.

## Test Execution Process

- `npm test` (suite complète, e2e « chemin jury » inclus) puis `npm run eval` ; CI GitHub Actions Node 20/22 sur push et PR, sans secret.
- L'eval écrit dans un répertoire temporaire, jamais dans `recognaize-cli-out/`.

## Mocking and Stubbing

- Pas de mocks réseau (aucun réseau) ; les sources sont testées sur des fichiers réels (fixtures) et des fichiers générés (mutants, hostiles). Le juge est testé sur un référentiel jouet de 3 marches, indépendant du référentiel réel.

## Test de fonctionnement réel (DEC-005)
Tout changement de `src/report/**`, `src/cli.ts` (sortie) ou du contenu du référentiel : passage navigateur réel obligatoire (serveur statique local, jamais `file://`) sur un profil complet / à trous / indéterminé, clics réels sur les liens interactifs, jugement de lisibilité — en plus de la revue automatisée, jamais à sa place. Toute propriété mécanique ainsi découverte devient immédiatement un test permanent (`test/report.*.test.ts`).

## Chemin agentique (`scripts/agentic/`)

Second chemin vers un verdict, comparatif, jamais un remplacement du chemin
déterministe : 5 sous-agents LLM (un par axe T/H/I/P/O, `subagent_type:
general-purpose`, contraints à un rôle d'extracteur pur) lisent un profil et
renvoient des signaux, jamais un jugement ; `scripts/agentic/judge-from-signals.ts`
réutilise `evaluateProofPathDefault`/`judge()` du chemin déterministe sans
dupliquer la logique.

- `test/agentic/judge-from-signals.test.ts` (13 tests) : teste UNIQUEMENT le pont
  (signal_id → Evidence → verdict) — jamais l'extraction LLM elle-même, non
  automatisable (aucun oracle). Deux régressions verrouillées : `T2.p2`/`T3.p2`
  ne contre-prouvent jamais (voie PR) ; `T4.p1` ne contre-prouve qu'à
  `xl_ratio` exactement `0`. Couvre aussi le champ `evidence[]` (en plus de
  `evidence_count`, ajouté pour alimenter `report-input.json`) : présence,
  vocabulaire (`axe`/`path_id`/`check_id`), tri déterministe `(axe, marche,
  source, check_id)` identique à `report/json.ts`.`sortEvidence`. Déterminisme
  testé aussi pour ce pont (mêmes signaux deux fois → sortie strictement
  identique, y compris avec les clés du JSON d'entrée dans un ordre
  différent), même garantie que le chemin CLI (`test/report.snapshot.test.ts`,
  hostile-determinism).
- `test/agentic/write-final-report.test.ts` (11 tests) :
  teste `scripts/agentic/write-final-report.ts` — écrit
  `recognaize-out-final/<profil>/{verdict.json,meta.json,report-input.json}`,
  jamais `report.md` (retiré, voir § Chemin agentique de
  `architecture.md`), jamais `recognaize-cli-out/`, jamais dans le dossier de
  profil analysé (même garde-fou que le CLI). Comprend un test de
  déterminisme (même entrée deux fois → fichiers strictement identiques), un
  test isolant `generated_at` comme seul horodatage non-déterministe du
  script, et un test de CHAÎNE RÉELLE (`write-final-report.ts` →
  `node dist/cli.js export`) qui verrouille la compatibilité des deux scripts
  dans le temps — jamais seulement le schéma testé isolément.
- Mode `export` de la CLI (`src/report/export-input.ts`, `src/cli.ts`) —
  ajouté pour que le chemin agentique produise un `report.html` dans EXACTEMENT
  le même format que le chemin déterministe, sans réimplémenter de renderer :
  - `test/report.export-input.test.ts` (24 tests) : contract test du schéma
    `--in` (champ manquant, type invalide, `evidence` vide acceptée). Verrouille
    une régression réelle trouvée en vérification bout-en-bout (2026-08-31) :
    `profile_id` doit déjà être en forme `sanitizeSubject` (`slug-hash`) —
    accepter puis réassainir un `profile_id` déjà assaini écrirait dans un
    second dossier, différent de celui du run déterministe du même profil
    (`sanitizeSubject` n'est pas idempotente).
  - `test/report.agentic-context.test.ts` (9 tests) : `agenticContext`
    (paramètre optionnel de `buildReportHtml`) absent ⇒ aucune trace dans le
    DOM (le CSS statique associé reste présent, sans effet — voir
    `test/report.snapshot.test.ts`) ; présent ⇒ bandeau, comparaison par axe,
    delta de confiance, diff des incohérences, aucun `undefined`/`null`/`NaN`,
    rendu déterministe.
  - `test/cli.export.test.ts` (11 tests) : e2e sur le binaire construit —
    entrée valide (avec/sans `--profile-dir`, avec/sans `agentic_context`),
    entrée invalide (exit 3), garde-fou `--out`/`--profile-dir`, déterminisme,
    et la régression `profile_id` ci-dessus au niveau CLI (dossier de sortie
    EXACTEMENT `<out>/<profile_id>`).
- Calibration de l'extraction LLM : validée par essais en direct (pas de test
  automatisé possible), match exact sur les 5 axes des 4 étalons, reproduit
  depuis un état propre. `scripts/agentic/signal-notes.ts` capitalise chaque
  piège d'extraction (proxy, valeur à calculer vs champ litéral, heuristique de
  spécificité) pour fiabiliser les essais suivants.
- `.claude/skills/recognaize-agentic/` : chaque action validée par un agent
  frais à contexte vide exécutant réellement `## Process` puis `## Test` —
  jamais un auto-rapport.
