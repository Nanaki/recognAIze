# 02 - Extract signals

Launch one extractor sub-agent per axis, in parallel, and merge their outputs into a single signal dictionary.

## Inputs

- `contracts` (required) - the 5 per-axis contracts from `01-prepare-analysis`.
- `profile_dir` (required) - same profile directory as `01-prepare-analysis`.
- `available_files` (required) - from `01-prepare-analysis`, so each sub-agent is told up front which raw files exist (never invent access to a missing file).

## Outputs

```json
{
  "GA.size_median": "l",
  "GA.ai_coauthored_ratio": 0.58,
  "RC.identity_file_specific": true,
  "...": "..."
}
```

A single flat dictionary, keys drawn only from the 5 contracts, merged across all 5 sub-agent responses.

## Depends on

- `01-prepare-analysis`

## Process

1. For each axis in `{T, H, I, P, O}`, launch one sub-agent (Claude Code's own Agent tool, `subagent_type: general-purpose`) in parallel — never sequentially, the 5 axes are independent. Give it, verbatim:
   - The role and rules from `@../references/extractor-role.md`.
   - That axis's contract from step 3 of `01-prepare-analysis`, as JSON.
   - The list of raw file paths under `profile_dir` that actually exist for that axis's relevant sources (e.g. the `T` sub-agent needs `git-activity.json`, `pull-requests.json`, `session.md` if present; the `H`/`O` sub-agents additionally need `repo-context/`; never hand a sub-agent a path that `01-prepare-analysis` found absent).
   - For `H` and any axis with `SU.*` signals in its contract (currently `T2.p4`, `I2.p3`): explicitly tell the sub-agent that `SU.*` signals require reading the full text content of specific skill/agent files under `repo-context/.claude/skills/` and `repo-context/.claude/agents/`, evaluating each file's specificity first (>= 2 of 4 hints: a plausible path cited in the text, a stack element named, >= 10 useful lines, an imperative English word such as must/never/always/required — English only, even for otherwise French-language files), and only then checking whether a specific file explicitly matches the signal's definition.
2. Collect all 5 sub-agent responses (each a `{signal_id: {value, citation}}` JSON object per its role contract).
3. Merge into one flat dictionary: for every sub-agent response, take only the `value` of each entry (drop the `citation` — it stays in the sub-agent's own transcript for traceability, not in the merged signal dict). If two sub-agents ever return the same `signal_id` with different values (should not happen — each contract is scoped to its own axis), keep the value from the axis whose letter prefixes the `signal_id`'s source (e.g. a `GA.*` key from the `T` sub-agent wins over a stray one from another axis) and note the conflict to the user.

## Test

Run the full flow on `fixtures/profiles/bohort` (has `pull-requests.json` and `repo-context/` with only `AGENTS.md`/`CLAUDE.md`/`docs/context/`/`docs/specs/` - no `.claude/skills/` or `.claude/agents/` directory): assert the merged dictionary contains at least one `GA.*` key, one `S.*` key, and several `RC.*` keys (identity/memory/capitalisation categories are legitimately present from `AGENTS.md`/`docs/context/`/`docs/specs/`), contains **no** key outside the union of the 5 contracts' `signal_id`s, and contains **no** `SU.*` key (both `SU.*` signals require a specific skill/agent file under `.claude/skills/` or `.claude/agents/`, which this profile genuinely lacks — the documented `bohort` case from calibration night, 2026-08-30).
