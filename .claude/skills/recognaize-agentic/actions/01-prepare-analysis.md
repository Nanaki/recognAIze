# 01 - Prepare analysis

Establish the deterministic baseline for a profile, then build the per-axis extraction contracts the agentic path will use.

## Inputs

- `profile_dir` (required) - path to a profile directory (e.g. `fixtures/profiles/bohort`), containing any subset of `git-activity.json`, `pull-requests.json`, `sonar-measures.json`, `session.md`, `repo-context/`, `declaratif.md`.

## Outputs

```yaml
deterministic_result_path: /tmp/recognaize-agentic-baseline/<profile>-<hash>/result.json
contracts:
  T: [{ signal_id, comparator, value, value_type, unit?, path_id, marche, note? }, ...]
  H: [...]
  I: [...]
  P: [...]
  O: [...]
available_files:
  - git-activity.json
  - session.md
  # only the files that actually exist under profile_dir
```

## Process

1. Run `node dist/cli.js analyze <profile_dir> --out /tmp/recognaize-agentic-baseline` (build first with `npm run build` if `dist/cli.js` is missing or older than `src/**`). This produces the deterministic baseline `result.json` — the ground truth the two tools are compared against in `03-judge-and-compare`. Always run this fresh: the CLI is fast (~1-2s) and fully deterministic, so there is no reason to search for or reuse a stale prior run.
2. List `profile_dir` to record which of the 6 known pieces (`git-activity.json`, `pull-requests.json`, `sonar-measures.json`, `session.md`, `repo-context/`, `declaratif.md`) actually exist. `declaratif.md` is listed for completeness only — it is never read by any extractor (see `@../references/extractor-role.md`, rule 5).
3. For each axis `T`, `H`, `I`, `P`, `O`, run `npx tsx scripts/agentic/signal-contract.ts <axis>` to get its real signal contract (walks the actual `thresholds` tree of `src/referentiel.json`, not the simplified `proof_paths[].signal_id` display label — a proof_path can compose more than one real signal, e.g. `H3.p2` needs both `GA.agents_md` and `GA.agents_md_last_updated_in_window`). Each contract entry already carries its `note` field from `scripts/agentic/signal-notes.ts` when the signal has a known naming pitfall or proxy definition.

## Test

Run step 1 and step 3 on `fixtures/profiles/bohort`: assert `/tmp/recognaize-agentic-baseline/bohort-*/result.json` exists (the exact `--out` path from step 1 — never the CLI's own default `recognaize-cli-out/`, which this action never uses) with `rang_affiche == "blue"`, and assert the `T` contract contains an entry with `path_id == "T2.p4"` whose `note` field is non-empty (regression check that the SU setup-indice signal and its calibration note are wired through).
