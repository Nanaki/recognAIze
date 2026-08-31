# 04 - Write final report

Write the consolidated final report for this profile to `recognaize-out-final/<profile_id>/`, so a run of this skill leaves a persistent artifact on disk, not just a comparison table in the conversation.

## Inputs

- `agentic` (required) - the exact `{ result, evidence_count }` object `03-judge-and-compare` got back from `judge-from-signals.ts`.
- `comparison` (required) - the per-axis comparison table and mismatch explanations built in `03-judge-and-compare`.
- `deterministic_result_path` (required) - from `01-prepare-analysis`.
- `profile_dir` (required) - from `01-prepare-analysis`'s input, unchanged.
- `model` (required) - the name of the model running *this* Claude Code session (a fact about the session, not a measurement - e.g. `claude-sonnet-5`). Sub-agents inherit this model unless a `model` override was explicitly passed to the `Agent` tool in `02-extract-signals`; if one was, say so instead of reporting a single model name.
- `token_estimate` (required) - `{ prompt_chars, output_chars, estimated_tokens, note }`, computed by *this skill* (see Process step 1), never invented.
- `cost_estimate` (required) - `{ usd, note }`, derived from `token_estimate` and the model's public per-token pricing.

## Outputs

`recognaize-out-final/<profile_id>/` (never `recognaize-cli-out/`, never inside `profile_dir`):

```
recognaize-out-final/<profile_id>/
  verdict.json   # agentic verdict + comparison, machine-readable
  meta.json      # model, token_estimate, cost_estimate, generated_at
  report.md      # human-readable summary: verdict table, per-axis confidence delta, axis comparison,
                  # mismatches, incoherences-comparison (common / deterministic-only / agentic-only), execution block
```

`report.md` narrates two things `verdict.json` alone leaves silent (found 2026-08-31, comparing a real report against its own JSON): WHY `confiance_globale` differs between the two paths (a per-axis table - `confiance_globale` is the min of the 4 official axes, so one under-covered or SU.*-boosted axis is enough to move it) and WHERE the two paths' `incoherences` lists diverge (common / deterministic-only / agentic-only) - both computed straight from the deterministic `result.json` (already has `axes[].confiance` and `incoherences`) and `03`'s own `agentic.result` (same shape), no new inputs needed.

## Depends on

- `03-judge-and-compare`

## Process

1. Compute `token_estimate` from what this skill actually sent/received in `02-extract-signals` and `03-judge-and-compare`: sum the character length of every extractor sub-agent prompt (`prompt_chars`) and every extractor sub-agent response plus the judge output (`output_chars`), then `estimated_tokens = round((prompt_chars + output_chars) / 4)` (a standard ~4-characters-per-token rule of thumb, not a real tokenizer count). Always set `note` to something like: `"estimation grossière (~4 caractères/token), pas une mesure exacte — l'outil Agent ne renvoie pas l'usage réel."` This is a hard platform limit (the `Agent` tool does not return usage metadata to the orchestrator) - never state or imply this number is exact.
2. Compute `cost_estimate.usd` from `token_estimate.estimated_tokens` and the running model's public per-token price (input/output rates may differ - a rough blended rate is fine given step 1 is already an estimate). Set `cost_estimate.note` to disclose this is derived from an estimate, e.g. `"dérivé de l'estimation de tokens ci-dessus et des tarifs publics du modèle — approximatif."` Note for the user, if relevant to their question: this project has no code path that calls the Anthropic API with a billed key (verified - no `ANTHROPIC_API_KEY` usage, no SDK dependency anywhere in `scripts/`/`src/`) - every call in this skill is this Claude Code session's own `Agent` tool, so this cost figure is a dimensioning estimate against the ~$1/profile budget target (`SKILL.md`), never an actual invoice line.
3. Run: `echo '<payload>' | npx tsx scripts/agentic/write-final-report.ts`, where `<payload>` is the JSON object `{ deterministic_result_path, agentic, comparison, model, token_estimate, cost_estimate, profile_dir }` (see `write-final-report.ts`'s `FinalReportInput` for the exact shape). The script reads `profile_id` from `deterministic_result_path` itself (never re-derived here) and refuses (throws) if the resolved output directory would land inside `profile_dir` - the same guard the CLI uses (`resolveSubjectOutputDir`).
4. Report the script's own stdout (`{ "out_dir": "..." }`) to the user as the final report's location, alongside the comparison table already shown in `03-judge-and-compare` - the file is a persistent artifact, not a replacement for reporting the finding in the conversation.

## Test

Run the full 4-action flow on `fixtures/profiles/bohort`: assert `recognaize-out-final/bohort-<hash>/` exists with all 3 files, `verdict.json`'s `agentic.rang_affiche` matches what `03` reported, `meta.json`'s `token_estimate.note` and `cost_estimate.note` both disclose the estimate (never silently presented as exact), and `report.md` explicitly states "Aucun désaccord" when the two tools agree on `bohort` (the exact calibration result reproduced live on 2026-08-30 for this fixture).
