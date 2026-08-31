---
name: adr
description: Architecture Decision Record log
argument-hint: N/A
---

# Architecture Decision Record (ADR)

Les décisions d'architecture qui régissent ce projet, chacune avec sa règle et ses conséquences.

## Decision Log

| ID      | Title                            | Rule                                                                                                                                                                                                          |
| ------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-001 | Fiabilité avant délai             | La fiabilité prime sur le délai : périmètre réduit plutôt que flaky ; tests et evals sont des gates à chaque étape ; le flow AIDD n'est jamais raccourci.                                                    |
| DEC-002 | Architecture B+ modulaire         | `referentiel.json` source de vérité unique (seuils, chemins de preuve) ; un check = un fichier par (marche × source) ; `core/` n'importe jamais un check ; un check désactivé rend ses chemins inconnus, jamais absents. |
| DEC-003 | Ownership affiché, non bloquant   | Ownership est calculé et affiché mais ne participe jamais à la ligne de montée ; il peut seulement faire baisser le rang affiché d'un cran au plus, avec mention explicite.                                  |
| DEC-004 | Cinquième pack déclaratif         | Un 5ᵉ pack, `core-declaratif`, existe pour le déclaratif — `confiance_source = 0` (ne prouve ni n'infirme jamais une marche seul) ; le miroir déclaré/observé et les indices négatifs sont une logique de rendu pure dans `report/html.ts`, jamais des checks. |
| DEC-005 | Test de fonctionnement réel       | Tout changement touchant `src/report/**`, `src/cli.ts` (sortie), `src/referentiel/concepts.json` ou `docs/referentiel.md` : toute propriété mécanique devient un test permanent ; ce qui dépend d'un jugement (lisibilité, navigation réelle) passe par un vrai navigateur, jamais `file://`, en plus de la revue de code, jamais à sa place. |
