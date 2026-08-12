#!/usr/bin/env bash
# Pulls upstream Karakeep changes into this fork.
#
# What it does, in order:
#   1. Ensures an `upstream` remote exists and fetches it.
#   2. Reads the fork's recorded base commit from CHANGELOG.md.
#   3. Reports how far behind upstream/main that base is, and — the useful
#      part — which of *this fork's own modified files* (not new files;
#      those can't conflict) currently differ from that base, so you know
#      what to watch for before merging.
#   4. Creates a local `fork-sync/<date>` branch off the current branch and
#      merges upstream/main into it.
#   5. On a clean merge, or once you've resolved conflicts and committed,
#      reminds you what to update by hand.
#
# It does not push anything or touch README/CHANGELOG for you — the base
# commit line and changelog entry are a deliberate human decision, not
# something to script.
#
# Usage: scripts/sync-upstream.sh
set -euo pipefail

UPSTREAM_URL="https://github.com/karakeep-app/karakeep.git"
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash first." >&2
  exit 1
fi

if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  echo "Adding remote '$UPSTREAM_REMOTE' -> $UPSTREAM_URL"
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

echo "Fetching $UPSTREAM_REMOTE/$UPSTREAM_BRANCH (full history) ..."
git fetch --unshallow "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" 2>/dev/null \
  || git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"

# The fork's current base is recorded in CHANGELOG.md's most recent release
# entry as: "Based on upstream Karakeep at\n[`<short-sha>`]"
BASE_SHA="$(grep -A1 'Based on upstream Karakeep at' CHANGELOG.md \
  | grep -oE '[0-9a-f]{7,40}' | head -1 || true)"

if [[ -z "$BASE_SHA" ]]; then
  echo "Could not find a recorded base commit in CHANGELOG.md — expected a" >&2
  echo "release entry with 'Based on upstream Karakeep at [\`<sha>\`]'." >&2
  exit 1
fi

if ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  echo "Base commit $BASE_SHA isn't reachable from $UPSTREAM_BRANCH's history." >&2
  echo "It may have been rebased away upstream. Resolve the full SHA by hand" >&2
  echo "and fetch it directly: git fetch $UPSTREAM_REMOTE <full-sha>" >&2
  exit 1
fi

BEHIND_COUNT="$(git rev-list --count "${BASE_SHA}..${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}")"
echo
echo "Recorded base:   $BASE_SHA"
echo "Upstream is:     $BEHIND_COUNT commit(s) ahead of that base on $UPSTREAM_BRANCH"

if [[ "$BEHIND_COUNT" -eq 0 ]]; then
  echo "Already up to date with upstream. Nothing to sync."
  exit 0
fi

echo
echo "Files this fork has modified since the recorded base (real conflict"
echo "surface — new files added by the fork can't conflict and aren't listed):"
git diff --name-only --diff-filter=M "$BASE_SHA" HEAD | sed 's/^/  /'

SYNC_BRANCH="fork-sync/$(date +%Y-%m-%d)"
echo
echo "Creating branch $SYNC_BRANCH and merging $UPSTREAM_REMOTE/$UPSTREAM_BRANCH ..."
git checkout -b "$SYNC_BRANCH"

if git merge "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --no-edit; then
  echo
  echo "Merge completed cleanly."
else
  echo
  echo "Merge has conflicts. Resolve them, then:"
  echo "  git add <resolved files>"
  echo "  git commit"
fi

NEW_SHA="$(git rev-parse "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
echo
echo "Once the merge is committed and the app builds:"
echo "  1. pnpm install && pnpm typecheck && pnpm lint && pnpm test"
echo "  2. Add a CHANGELOG.md entry for the next release, recording the new"
echo "     base as [\`${NEW_SHA:0:7}\`] (full: $NEW_SHA)"
echo "  3. Open a PR from $SYNC_BRANCH"
