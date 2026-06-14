# Video Downloading as a First-Class Feature — Design

Date: 2026-06-14
Status: Approved (sprint to implementation)
Branch: `worktree-feature+video-first-class`

## Goal

Make yt-dlp video capture a first-class, user-controllable feature instead of an
invisible, always-on server behavior. Three capabilities:

1. **Surface the configured video settings** in the UI (admin, read-only).
2. **Show per-bookmark download progress** (status states, not a percentage bar).
3. **Toggle video capture per bookmark** via a global default + per-bookmark override.

## Decisions (locked)

- **Progress granularity:** status states only — no yt-dlp stdout parsing.
- **Capture model:** global server default + per-bookmark tri-state override
  (`inherit` / `force-on` / `force-off`).
- **Settings visibility:** admin-only read-only card.
- **Toggle trigger:** `updateBookmark` enqueues a video job directly when capture
  flips effectively-on for an already-crawled bookmark with no video asset.

## Existing-code anchors

- Read-only server config to client: `clientConfig` (`packages/shared/config.ts:560`)
  → `config.clientConfig` tRPC query → `useClientConfig()`.
- Admin gating: `role === "admin"`; `packages/trpc/routers/admin.ts`
  (`createAdminScopedProcedure`); admin overview at `apps/web/app/admin/overview`.
- Polling model (no realtime): `getBookmarkRefreshInterval` /
  `isBookmarkStillLoading` in `packages/shared/utils/bookmarkUtils.ts`.
- Queue: liteque, no progress field; workers write status only at terminal states.
- Video trigger gated solely on `serverConfig.crawler.downloadVideo` at
  `apps/workers/workers/crawlerWorker.ts:2343`.
- Per-bookmark user flag precedent: `archived` / `favourited` on `bookmarks`,
  set via `updateBookmark` (`packages/trpc/routers/bookmarks.ts`), schema in
  `packages/shared/types/bookmarks.ts` (`zUpdateBookmarksRequestSchema`).
- Status precedent: `bookmarkLinks.crawlStatus` enum in
  `packages/db/schema.sqlite.ts` / `schema.pg.ts`.
- Video tab UI: `apps/web/components/dashboard/preview/LinkContentSection.tsx`
  (currently disabled until `videoAssetId` is non-null).

## Data model

One migration, both dialects (`schema.sqlite.ts` + `schema.pg.ts`):

- `bookmarks.captureVideo` — nullable boolean. `null` = inherit server default,
  `true` = force on, `false` = force off. (User-controlled flag, mirrors
  `archived`/`favourited`.)
- `bookmarkLinks.videoDownloadStatus` — nullable enum
  `["pending","downloading","success","failure"]`. `null` = never attempted /
  capture off. (Crawl-side status, mirrors `crawlStatus`.)

Generate with `pnpm db:generate --name video_first_class`. Smoke-test the
migration against `postgres:18-alpine` (production is PG18).

## Capture decision + trigger

- Helper: `resolveShouldCaptureVideo(bookmark, serverConfig) =
  bookmark.captureVideo ?? serverConfig.crawler.downloadVideo`.
- Crawl time (`crawlerWorker.ts:2343`): replace the bare server flag with the
  resolved value. Worker already loads bookmark details → reads `captureVideo`
  directly; no new crawl-payload field.
- On toggle (`updateBookmark`): if resolved value becomes on AND the bookmark is
  already crawled AND no `LINK_VIDEO` asset exists → enqueue `VideoWorkerQueue`
  and set `videoDownloadStatus = "pending"`. Toggling off does not kill a running
  job; the indicator just stops showing.

## Worker status writes + polling keep-alive

- `videoWorker.ts`: set `downloading` at run start; `success` / `failure` at the
  terminal points. Write to `bookmarkLinks.videoDownloadStatus`.
- `bookmarkUtils.ts`: extend `isBookmarkStillLoading()` so
  `videoDownloadStatus ∈ {pending, downloading}` keeps polling alive (otherwise
  the UI stops polling and never reveals the finished video).
- Surface `captureVideo` + `videoDownloadStatus` through `models/bookmarks.ts`
  into `zBookmarkSchema`.

## UI

- **Toggle:** tri-state control (Default / On / Off) in the bookmark content/options
  area, wired to `useUpdateBookmark`.
- **Progress:** replace the disabled-until-present video tab with status rendering:
  `pending`/`downloading` → spinner + "Downloading video…"; `failure` → message +
  Retry (same enqueue path); `success` → existing `<video>` player.
- **Admin card:** read-only `AdminCard` on `/admin/overview` showing
  `downloadVideo`, `maxVideoDownloadSize`, `downloadVideoTimeout`,
  `ytDlpArguments`, fed by a new admin-scoped `admin.videoConfig` procedure.

## Testing

- Unit (TDD): `resolveShouldCaptureVideo` tri-state table; `isBookmarkStillLoading`
  with the new video states.
- Integration (vitest trpc/worker pattern): toggle-on enqueues a job for a crawled
  bookmark; worker transitions pending→downloading→success/failure.
- Full local gate before push: `pnpm format:fix && pnpm lint && pnpm typecheck &&
  pnpm test`.

## Rollout

App-repo change (not the helm chart). Sequence: merge to fork `main` → image
build/publish pipeline produces a new `ghcr.io/johnford2002/karakeep` tag → bump
`charts/karakeep` `imageTag` in helm-charts → ArgoCD syncs. Exact image-build
trigger to be confirmed during the rollout step.

## Out of scope

- Real percentage progress / ETA (status-only by decision).
- Realtime push (websockets/SSE) — stays on the existing polling model.
- Bulk per-bookmark toggling UI.
