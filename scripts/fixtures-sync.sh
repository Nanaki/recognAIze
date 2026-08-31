#!/usr/bin/env bash
# fixtures-sync.sh
#
# Re-clones ai-driven-dev/laivel-up at the pinned SHA and diffs its
# profiles/{perceval,bohort,leodagan,arthur,venec,lancelot} against
# fixtures/profiles/ in this repo, to detect drift from the pinned upstream
# source. `venec`/`lancelot` carry no documented expected rank upstream
# ("non donné", profiles/README.md) — never added to evals/expected.json,
# see fixtures/profiles/ATTRIBUTION.md.
#
# Exit 0: fixtures match the pinned SHA (no drift).
# Exit 1: fixtures differ from the pinned SHA (drift detected) — the diff is
#         printed to stderr.
#
# This script never modifies fixtures/profiles/ itself; it only reports.

set -euo pipefail

REPO_URL="https://github.com/ai-driven-dev/laivel-up.git"
PINNED_SHA="b5e966164195db9f6a2656d9b7a8478123f4e5be"
PROFILES=(perceval bohort leodagan arthur venec lancelot)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES_DIR="$REPO_ROOT/fixtures/profiles"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "fixtures-sync: cloning $REPO_URL at $PINNED_SHA into $TMPDIR ..." >&2

git clone --quiet "$REPO_URL" "$TMPDIR/laivel-up" >&2
git -C "$TMPDIR/laivel-up" checkout --quiet "$PINNED_SHA"

DRIFT=0

for profile in "${PROFILES[@]}"; do
  UPSTREAM_DIR="$TMPDIR/laivel-up/profiles/$profile"
  LOCAL_DIR="$FIXTURES_DIR/$profile"

  if [ ! -d "$UPSTREAM_DIR" ]; then
    echo "fixtures-sync: DRIFT — upstream profile '$profile' not found at pinned SHA" >&2
    DRIFT=1
    continue
  fi

  if [ ! -d "$LOCAL_DIR" ]; then
    echo "fixtures-sync: DRIFT — local fixture '$profile' is missing (fixtures/profiles/$profile)" >&2
    DRIFT=1
    continue
  fi

  if ! diff -rq "$UPSTREAM_DIR" "$LOCAL_DIR" >&2; then
    echo "fixtures-sync: DRIFT — fixtures/profiles/$profile differs from upstream at $PINNED_SHA" >&2
    DRIFT=1
  fi
done

if [ "$DRIFT" -ne 0 ]; then
  echo "fixtures-sync: drift detected — fixtures/profiles/ no longer matches ai-driven-dev/laivel-up@$PINNED_SHA" >&2
  exit 1
fi

echo "fixtures-sync: OK — fixtures/profiles/ matches ai-driven-dev/laivel-up@$PINNED_SHA"
exit 0
