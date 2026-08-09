# Syncing with upstream

Keepsake's whole reason to exist as a fork rather than a fully separate
project is that upstream Karakeep keeps improving the engine — crawling, AI,
search, the API, mobile and browser clients — and this fork wants to keep
picking that up. This document is the process for doing that; `scripts/sync-upstream.sh`
automates the mechanical parts of it.

## How the fork tracks its base

Every release's [`CHANGELOG.md`](./CHANGELOG.md) entry records the exact
upstream commit it was built from:

```markdown
First release. Based on upstream Karakeep at
[`764ba85`](https://github.com/karakeep-app/karakeep/commit/764ba85) (~0.33).
```

That line is the source of truth for "how far behind upstream are we" — not
a separate tracking file, and not the tag name (upstream doesn't tag every
commit, and this fork's version numbers are its own).

## Running a sync

```bash
scripts/sync-upstream.sh
```

The script:

1. Adds an `upstream` remote (`github.com/karakeep-app/karakeep`) if it
   doesn't already exist, and fetches it.
2. Parses the base commit out of `CHANGELOG.md`.
3. Reports how many commits upstream is ahead, and — the part worth
   reading before you merge — which files *this fork has itself modified*
   since that base. New files the fork added can't conflict, so they're
   left out; this list is the real conflict surface.
4. Creates a `fork-sync/<date>` branch and merges `upstream/main` into it.
5. On conflicts, stops and tells you what to do next; on a clean merge,
   tells you what to update by hand (see below).

It never pushes anything, and never edits `CHANGELOG.md` for you — recording
what changed is a judgment call, not something to template.

## What tends to conflict, and why

As of the 0.1.0 base, the fork's modified-file list breaks down like this:

- **Route pages that mount the fork's UI in place of the stock one**
  (`apps/web/app/dashboard/{bookmarks,archive,favourites,lists,tags}/page.tsx`,
  the modal and full-page preview routes, `dashboard/layout.tsx`,
  `settings/layout.tsx`). These conflict whenever upstream touches the same
  page for its own reasons — a new query param, a loading state, a
  provider. Usually a small, readable conflict: take upstream's data/logic
  changes, keep the fork's component swap.
- **Components the fork edited in place rather than replacing**
  (`EditorCard.tsx`, `ProfileOptions.tsx`, `ActionBar.tsx`,
  `BookmarkPreview.tsx`, `NoteEditor.tsx`, the settings components under
  `apps/web/components/settings/`, `BookmarkDebugger.tsx`). These carry
  fork-specific sizing or palette tweaks inline. Same pattern: take
  upstream's behavior, keep the fork's styling diff, re-verify visually.
- **Engine files this fork has deliberately touched despite the "engine
  stays upstream" rule** — currently the AI inference workers
  (`apps/workers/workers/inference/*`) and the `taggingStatus`/
  `summarizationStatus` schema and API surface
  (`packages/db/schema.ts`, `packages/shared/types/bookmarks.ts`,
  `packages/trpc/routers/admin.ts`, `packages/open-api/lib/admin.ts`,
  `apps/cli/src/commands/admin.ts`). If upstream changes the same
  functions, expect a real conflict, not a cosmetic one — read both sides
  before resolving.
- **Fork-owned config** (`tailwind.config.ts`, `dense-theme.css`,
  `docker/docker-compose.yml`, `.github/workflows/docker.yml`). Upstream
  rarely touches these in fork-relevant ways, but when it does (a new
  Tailwind token, a new compose service) the conflict is usually additive.
- **`apps/web/components/dashboard/dense/`, `apps/web/lib/dense/`,
  `design/`** are entirely new — upstream has no knowledge of them, so they
  cannot conflict. They can still *break* silently if upstream renames or
  removes something they import from (a shared component, a tRPC
  procedure, a type) — that shows up as a typecheck failure, not a merge
  conflict, so run `pnpm typecheck` even on a conflict-free merge.

## After a clean merge or conflict resolution

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test` — a
   conflict-free merge can still break the fork if upstream renamed
   something the `dense/` components depend on.
2. Spot-check the fork's own screens live (list, detail, settings, theme
   picker) — nothing in CI catches a visual regression.
3. Add a `CHANGELOG.md` entry for the next release recording the new base
   commit, in the same format as the existing entries.
4. Open a PR from the `fork-sync/<date>` branch.

## What doesn't need syncing

Anything under `docs/` (upstream's own versioned documentation site),
`tools/`, `tooling/`, `charts/`, `kubernetes/` and the rest of upstream's own
infrastructure should be taken as-is from upstream on every sync — this fork
doesn't maintain a divergent copy of any of it. If a merge conflict shows up
in one of those paths, it almost always means upstream restructured
something the fork's own files still reference elsewhere; fix the reference,
don't fight the conflict by hand-editing upstream's file.
