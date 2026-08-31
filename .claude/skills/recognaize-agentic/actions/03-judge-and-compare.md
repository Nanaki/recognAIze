# 03 - Judge and compare

Turn the merged signal dictionary into an agentic verdict via the same deterministic judge the CLI uses, then show it side by side with the deterministic baseline.

## Inputs

- `signals` (required) - the merged dictionary from `02-extract-signals`.
- `deterministic_result_path` (required) - from `01-prepare-analysis`.

## Outputs

A comparison table plus the full agentic `result.json`-shaped payload:

```
| axis | deterministic CLI | agentic | match |
|------|--------------------|---------|-------|
| T    | T4                 | T4      | yes   |
| H    | H5                 | H5      | yes   |
| I    | I3                 | I3      | yes   |
| P    | P3                 | P3      | yes   |
| O    | O4                 | O4      | yes   |

rang_affiche: deterministic=copper, agentic=copper
```

## Depends on

- `02-extract-signals`

## Process

1. Write `signals` to a temp JSON file (or pipe directly), then run: `echo '{"signals": <signals>}' | npx tsx scripts/agentic/judge-from-signals.ts`. This reuses `evaluateProofPathDefault` and `judge()` unchanged from the deterministic CLI — never re-implement judging logic here. Two documented, tested exceptions are already handled inside that script: `T2.p2`/`T3.p2` (pull-requests path) never counter-prove, and `T4.p1` only counter-proves when `GA.xl_ratio` is exactly `0`.
2. Read `deterministic_result_path` (from `01-prepare-analysis`) and extract `rang_affiche` plus each axis's `niveau_prouve` and `ownership.niveau_prouve`.
3. Render the comparison table: one row per axis (`T`, `H`, `I`, `P`, `O` for Ownership), deterministic `niveau_prouve` vs agentic `niveau_prouve`, plus a final `rang_affiche` line for both tools.
4. If any axis differs between the two tools, call it out explicitly and explain from the agentic run's raw signals + citations (kept in the `02-extract-signals` sub-agent transcripts) why — never silently report only the matching cases. A mismatch is a genuine finding, not noise to hide.
5. Report the agentic run's `confiance_globale` alongside the deterministic one — expect it to differ slightly on `T`/`I` whenever `SU.*` signals fired (the deterministic CLI structurally cannot populate them — see `T2.setup.ts`/`I2.setup.ts` in the main CLI's own checks — so the agentic path's `T`/`I` confidence can legitimately be higher when a qualifying skill/agent file exists).

## Test

Run the full 3-action flow on `fixtures/profiles/bohort`: assert both `rang_affiche` values equal `"blue"` and all 5 axis rows show `match: yes` (the exact calibration result reproduced live on 2026-08-30 for this fixture).
