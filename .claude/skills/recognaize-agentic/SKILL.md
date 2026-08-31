---
name: recognaize-agentic
description: Produce an AI-Driven Development rank verdict for a developer profile (git activity, PRs, repo-context, session) using parallel LLM extractor sub-agents plus the exact same deterministic judge as the recognAIze CLI, then compare both verdicts side by side and write a final consolidated report to `recognaize-out-final/<profile_id>/`. Use when the user asks to run the agentic tool on a profile, compare the two recognAIze tools on a profile, or analyze a profile "with the agentic" / "avec l'outil agentique" / "avec l'agentique". Do NOT use for a plain deterministic analysis with no comparison intent - run `node dist/cli.js analyze <profile>` directly instead; do NOT use to modify `src/referentiel.json`, `src/core/**`, or `src/checks/**` - those are the shared CLI source, edited by hand, never by this skill.
---

# recognAIze Agentic

Runs recognAIze's secondary, agentic verdict path on a developer profile: five parallel extractor sub-agents (one per axis - Taille/Harness/Intervention/Parallèle/Ownership) read the profile's raw files and return only signal values, which then feed the exact same deterministic judge (`src/core/judge.ts`) the CLI uses. Produces a side-by-side comparison against `node dist/cli.js analyze`, so the two tools' verdicts can be checked against each other on the same profile, then writes a final consolidated report to `recognaize-out-final/<profile_id>/`. Useful whenever the deterministic CLI's blind spots (it cannot read repo-context file *content*, only classify artifacts) need a second, LLM-based read of the same evidence.

## Available actions

| #   | Action                 | Role                                                                | Input                                   |
| --- | ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| 01  | `prepare-analysis`     | Run the deterministic baseline, build the 5 per-axis contracts       | `profile_dir`                                      |
| 02  | `extract-signals`      | Launch 5 parallel extractor sub-agents, merge into one signal dict   | `contracts`, `profile_dir`                         |
| 03  | `judge-and-compare`    | Judge the merged signals, compare against the deterministic result   | `signals`, `deterministic_result_path`             |
| 04  | `write-final-report`   | Write the consolidated final report to `recognaize-out-final/<profile_id>/`     | `agentic` (03's output), `comparison`, `deterministic_result_path`, `profile_dir` |

## Default flow

Sequential skill: `01 → 02 → 03 → 04`. No skipping - `02` needs `01`'s contracts, `03` needs `02`'s merged signals and `01`'s deterministic baseline, `04` needs `03`'s judged verdict and comparison.

## Transversal rules

- Every extractor sub-agent is bound by `@references/extractor-role.md` - it never judges, never invents a value, and omission always means "unknown", never a guessed default.
- `declaratif.md` is never read by any extractor and never feeds any signal (DEC-004: self-declared answers carry zero weight in this referential).
- Never re-implement judging logic in this skill. `03-judge-and-compare` calls `scripts/agentic/judge-from-signals.ts`, which reuses `evaluateProofPathDefault`/`judge()` unchanged from the CLI - any divergence between the two tools must come from the *signals*, never from a second judging algorithm.
- Budget target: keep each profile's run under ~1$ of sub-agent usage (5 parallel extractor calls, no iterative retries) - a dimensioning target for this session's own sub-agents, not a billed external API integration. `04`'s `cost_estimate` is the same target expressed as an actual (approximate) number for this run, not a separate budget.
- A verdict mismatch between the two tools is a genuine finding to report to the user, never something to silently reconcile or hide - `04` writes every mismatch into the final report, never only the matching rows.
- No code path in this project ever reads an API key or calls the Anthropic API directly (verified: no `ANTHROPIC_API_KEY` usage, no `@anthropic-ai/sdk` dependency) - every LLM call in this skill is a Claude Code `Agent` tool invocation of *this* session, never a separately billed API call. `04`'s token/cost figures are therefore always estimates (see below), never a real usage measurement.
- Token/cost reporting is a hard estimate, not a measurement: the `Agent` tool does not return usage metadata to the orchestrator, so exact token counts for sub-agent calls are not obtainable from within this skill. `03`/`04` must compute `token_estimate` (prompt/output character counts -> ~4 chars/token) and `cost_estimate` (from the model's public per-token pricing) themselves and pass them to `04-write-final-report`, always carrying the `note` field disclosing the estimate - never presented as an exact count (same rigor as the CLI's own rang/fourchette/confiance: `.claude/rules/fiabilite.md`, "jamais un rang sans sa fourchette et sa confiance ; l'inconnu ne prouve jamais rien").
- **This skill's own verdict is NOT guaranteed deterministic run-to-run** (found 2026-08-31, revue "shadow areas", gap "unstated assumption"): `02`'s extraction is an LLM reading raw text, not a deterministic function - re-running this skill on the *same* profile can legitimately produce different signal values, a different `confiance_globale`, or even a different `rang_affiche`, unlike `node dist/cli.js analyze` (`.claude/rules/fiabilite.md`: "même entrée -> même result.json"). Say this explicitly to the user if they ask why two runs differ, or before they rely on a single run as if it had that CLI-level guarantee - never imply the agentic verdict carries the same repeatability promise.

## References

- `references/extractor-role.md` - the exact rules injected into every extractor sub-agent's prompt

## External data

- `scripts/agentic/signal-contract.ts` - derives the real per-axis signal contract from `src/referentiel.json`'s `thresholds` tree (shared source of truth, never copied)
- `scripts/agentic/signal-notes.ts` - calibration notes per signal_id (proxies, naming pitfalls) discovered empirically against the 4 reference profiles
- `scripts/agentic/judge-from-signals.ts` - the deterministic bridge from a signal dictionary to a full judge verdict, reusing the CLI's own judge unchanged
- `scripts/agentic/write-final-report.ts` - writes `recognaize-out-final/<profile_id>/{verdict.json,meta.json,report.md}` from `03`'s judged verdict, the comparison, and the orchestrator-supplied model/token/cost estimate - assembles and writes only, never judges
- `test/agentic/judge-from-signals.test.ts` - regression tests for the bridge's two documented judging exceptions (T2.p2/T3.p2 never counter-prove; T4.p1 only counter-proves at exactly `xl_ratio = 0`)
- `test/agentic/write-final-report.test.ts` - regression tests for `04`'s file-writing contract (profile_id-named output dir, never inside `recognaize-cli-out/`, never inside the analyzed profile dir, every mismatch surfaced)
- `fixtures/profiles/{perceval,bohort,leodagan,arthur}/` - the 4 calibrated reference profiles (expected ranks: red, blue, green, copper) used to validate this skill's actions
