---
name: testing
description: Testing strategy and guidelines
argument-hint: N/A
scope: all
---

# Testing Guidelines

> État : réel, vérifié contre le dépôt. 1326 tests verts (`npm test` : 1307
> sur le chemin déterministe + `npm test test/agentic/` : 19 sur le pont
> agentique et le rapport final agentique), `npm run eval` 4/4 rang exact.

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

- `test/agentic/judge-from-signals.test.ts` (9 tests) : teste UNIQUEMENT le pont
  (signal_id → Evidence → verdict) — jamais l'extraction LLM elle-même, non
  automatisable (aucun oracle). Deux régressions verrouillées : `T2.p2`/`T3.p2`
  ne contre-prouvent jamais (voie PR) ; `T4.p1` ne contre-prouve qu'à
  `xl_ratio` exactement `0`. Déterminisme testé aussi pour ce pont (mêmes
  signaux deux fois → sortie strictement identique, y compris avec les clés
  du JSON d'entrée dans un ordre différent), même garantie que le chemin CLI
  (`test/report.snapshot.test.ts`, hostile-determinism).
- `test/agentic/write-final-report.test.ts` (10 tests) :
  teste `scripts/agentic/write-final-report.ts` — écrit
  `recognaize-out-final/<profil>/{verdict.json,meta.json,report.md}`, jamais
  `recognaize-cli-out/`, jamais dans le dossier de profil analysé (même
  garde-fou que le CLI). Comprend un test de déterminisme (même entrée deux
  fois → fichiers strictement identiques) et un test isolant `generated_at`
  comme seul horodatage non-déterministe du script.
- Calibration de l'extraction LLM : validée par essais en direct (pas de test
  automatisé possible), match exact sur les 5 axes des 4 étalons, reproduit
  depuis un état propre. `scripts/agentic/signal-notes.ts` capitalise chaque
  piège d'extraction (proxy, valeur à calculer vs champ litéral, heuristique de
  spécificité) pour fiabiliser les essais suivants.
- `.claude/skills/recognaize-agentic/` : chaque action validée par un agent
  frais à contexte vide exécutant réellement `## Process` puis `## Test` —
  jamais un auto-rapport.
