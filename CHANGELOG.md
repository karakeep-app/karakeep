# Changelog

All notable changes to this fork's interface are recorded here. Engine changes
come from [upstream Karakeep](https://github.com/karakeep-app/karakeep) and are
noted by the upstream commit each release is based on.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Opening `/dashboard/search` without a query fired a `searchBookmarks`
  request for the empty string, and the page turned any search failure into
  the dashboard's error boundary. On a server with no search backend
  configured that empty request always fails, so simply landing on the
  route crashed it — and since that page also hosts the mobile Search tab,
  which is the mobile shell's *default landing tab*, the entire mobile app
  opened onto a crashed screen, over a query the user never typed. The
  search query is now gated on there actually being a query on both the
  desktop and mobile halves of the page, and the desktop half shows a short
  "search from the field above" line instead of a skeleton that could never
  resolve. `useBookmarkSearch` takes an optional `enabled` flag for this and
  defaults to `true`, so other callers are unaffected.
- `three` (~365KB minified) was pulled into `/dashboard/search`'s shared
  bundle for every visitor. Only the mobile empty-queue hero uses it, via
  Vanta — a screen desktop never renders at all, and one that only appears
  when the queue is completely empty. Vanta was already dynamically
  imported but `three` was still a static import in the same module, which
  defeated most of the point; the hero is now lazily imported as a whole, so
  `three`, `vanta` and the hero's own code all load as separate chunks only
  when that state is actually reached. This also fixed a latent race the
  static import had been masking: the hero used to render synchronously and
  usually beat the crash above, so the empty-queue screen appeared to work.
- AI tagging and summarization jobs that did no work — feature disabled,
  no inference client configured, no content to infer from — were marked
  `success` just like a job that actually produced tags or a summary. A
  bookmark could carry `summarizationStatus: "success"` with no `summary`
  ever set, and nothing distinguished the two: not the API, the admin
  debugger, or the CLI. Both statuses now have a third value, `skipped`,
  set only when the job consciously did nothing. This is an additive
  schema change (no migration needed) and an additive API change (existing
  `success | failure | pending | null` consumers are unaffected unless they
  read the new value). The admin bookmark debugger, the `admin` CLI's
  retag/resummarize `--status` filter, and the `reRunInferenceOnAllBookmarks`
  API now all recognize `skipped`.
- The Docker release workflow pushed to upstream's own registry namespaces
  (`ghcr.io/hoarder-app/*`, `ghcr.io/karakeep-app/*`) using a PAT secret this
  fork never had, so it would have failed outright the first time it ran.
  It now builds and pushes `ghcr.io/hexpum/keepsake-ui*` using the repo's
  built-in `GITHUB_TOKEN`. Separately, `docker/docker-compose.yml` — the
  quick-start compose file — pulled `ghcr.io/karakeep-app/karakeep`
  directly: following it would have deployed plain upstream Karakeep, not
  this fork's UI, with no error to indicate the mismatch. It now pulls
  `ghcr.io/hexpum/keepsake-ui`.
- Row titles and summaries in the list and grid views could not be
  selected or copied — a known limitation since 0.1.0. The row was covered
  by an absolutely positioned link with the actual text set to
  `pointer-events: none` so clicks would pass through to it, which also
  blocks text selection. Replaced with a real link on the title and a
  click handler on the row itself that ignores clicks on interactive
  descendants (tags, the favourite button, the overflow menu) and clicks
  that just finished a text selection, so the row is still clickable
  anywhere, Ctrl/Cmd-click and middle-click still open a new tab, and the
  text is selectable again. The row handler also ignores clicks arriving
  from portaled content: the row's Edit/Delete dialogs render under
  `<body>` but remain React children of the row, so React bubbles their
  clicks to it — without that guard, clicking a dialog's padding or its
  backdrop navigated away and tore the dialog down mid-edit.

### Added

- **A dedicated mobile shell**, first pieces of a ground-up mobile redesign
  (design in `design/Keepsake Mobile Designs.html`). Below `sm`, the app
  previously fell back to upstream's stock `MobileSidebar` — a plain
  top-of-page icon strip — plus the desktop content squeezed narrow, with
  no mobile-specific treatment at all. That's replaced by a fixed bottom
  tab bar (Search, Browse, capture, Favourites, Settings) using the same
  runtime theme tokens as the rest of the fork. The design drew five tabs
  (Search/Lists/+/Tags/Favourites) but its own capture-screen note said
  lists, tags and the grid collapse into one browse surface rather than
  three tabs — so Tags folds into Browse here, freeing a slot for
  Settings, which the design had no tab for. Adds `gsap`, `lenis`, `three`
  and `vanta` as dependencies for this and later screens' motion.
- **Search doubles as home** on mobile (design screen 2b): the Search tab
  shows the same plain queue the desktop Files page uses when the query is
  empty, and switches to live results from the existing search
  infrastructure once you type — one screen, not a search page plus a
  separate list page. Reuses `useBookmarkSearch`/`useDoBookmarkSearch` and
  `DenseBookmarkRow` as-is rather than a parallel implementation, with Lenis
  smooth-scroll and a GSAP stagger-in that fires once per query change, not
  on every background refetch. The design's filter pills, matched-term
  highlighting and "ask your summaries" row aren't built: none has a
  corresponding API today (a result-type facet, match spans, or an AI
  question-answering endpoint), so they're left out rather than wired to
  fake behaviour.
- **Mobile empty-queue hero and a real mobile settings shell** (design
  screen 2e), the last piece of the mobile redesign. A genuinely empty
  queue on the search-as-home screen now gets a live Vanta.NET field
  behind "Nothing left to read." instead of a plain line — the design's
  own note singles this out as the one place ambient motion earns its
  keep on an otherwise-static app — followed by a real stat block off
  `users.stats`. Two of the design's four stat labels are swapped for
  ones this app actually tracks: `avg_save_time` and `summarised%` are
  not stats Karakeep has ever recorded (no timing telemetry, no aggregate
  summarisation count), so `tags_used` and `favourited` take their place
  rather than shipping labels wired to nothing. `vanta`/`three` add real
  weight (a 3D scene graph), so they're dynamically imported — only the
  empty-queue case ever needs them. `vanta` ships no types at all;
  `apps/web/@types/vanta.d.ts` declares just the one effect this fork
  imports, derived from reading the package's own source rather than
  guessing a shape.

  Separately, `/settings` still fell back to the stock `MobileSidebar` (a
  bare icon strip) below `sm`, with no bottom tab bar at all — leaving
  settings felt like leaving the app's mobile chrome entirely. Settings
  now mounts the same `MobileShell` every dashboard page uses, and the
  icon strip is replaced with a labelled, dense-styled pill nav. The
  design's own settings block (four toggles: summarise-on-save, watch
  clipboard for links, swipe actions on rows, a dense/roomy density mode)
  isn't what this became: three of the four don't correspond to anything
  built (background clipboard watching has no web API a page can use;
  swipe-to-reveal actions and a second row-density mode were never
  implemented as features, so a toggle for either would control nothing),
  and the real settings surface is eleven actual destination pages, not
  four in-place switches — a nav strip serves that surface honestly where
  a row of mostly-decorative toggles wouldn't.
- **Mobile browse** (design screen 2d): the tab bar's Browse destination is
  now a real screen instead of the plain desktop Lists page squeezed to
  phone width — a 2-column grid of list cards (icon, name, item count via
  the same `lists.stats` query the desktop tree view uses), a usage-sorted
  tag cloud with counts, and a small "recently added" glance, matching the
  design's own note that lists, tags and the grid collapse onto one browse
  surface rather than three tabs. "All lists"/"All tags" links and tapping
  a card fall through to the existing (not yet mobile-styled) list/tag/
  bookmark-detail pages — this screen is the browse *overview* the design
  actually drew, not a mobile pass over every list and tag page, which
  stays a documented boundary rather than a silent gap.
- **Mobile read/detail** (design screen 2c): tapping a bookmark on mobile
  now opens a full-screen read-out instead of the desktop dialog/split-pane
  squeezed into a phone width. Two of the design's own GSAP behaviours are
  carried over verbatim from its component source rather than re-derived
  from the screenshot: a hairline progress rule at the top fills as the
  page scrolls, and the title does a word-by-word split reveal on open.
  Reuses `DenseBookmarkDetail`'s data helpers (`parseSummary`,
  `formatSavedAgo`, `estimateReadingTimeMinutes`) and the existing row
  overflow menu (open original, archive, edit tags, re-summarise, delete)
  rather than duplicating any of that logic. Wired into both places a
  bookmark can be opened from: the intercepted modal route (soft nav from
  a list) and the plain preview route (hard nav/refresh) — the modal route
  now decides between Radix's dialog and the full-screen mobile view with
  a `matchMedia` check rather than CSS alone, because Radix's dialog
  overlay always portals to `<body>` and would otherwise darken the whole
  screen even when its content box was hidden. The design's flowing prose
  paragraphs under the summary card and its "related" block aren't built:
  the former reads as placeholder article text where Karakeep only has the
  one AI summary field (already fully surfaced), and the latter has no
  similar-bookmarks endpoint to back it.
- **A real capture sheet** for the tab bar's centre button, replacing the
  desktop `QuickAddDialog` reuse from the first mobile-shell pass. Springs
  up from the bottom (GSAP, matching the design's own timing) with
  +tag/+list chips and a summarise-now toggle, and on Save springs back
  down immediately with a confirmation toast — the actual bookmark
  creation, tag/list attachment and summarisation trigger all happen
  after, off-screen, matching the design's own note that "the save never
  waits on the network." Karakeep has no way to attach tags or lists at
  creation time, so tapping a chip stages a local selection (via the
  existing `TagsEditor` and `BookmarkListSelector`, both already
  bookmark-independent controlled components) rather than attaching
  anything immediately; Save fires creation and then the attach calls back
  to back. Confirmed both actually persist, not just stage: a bookmark
  captured with a tag and a list staged shows the tag on reload and
  increases the target list's item count.
- **Foldable sidebar sections.** Lists and Tags each have a chevron on
  their heading and fold independently, with the state remembered per
  browser. The heading and chevron are a single control, so clicking the
  word folds rather than navigating. Each section now also ends in an
  "All lists" / "All tags" link: the sidebar only ever shows the first 8,
  and previously the heading itself was the only route to the full index
  pages — which the fold toggle now occupies.
- `scripts/sync-upstream.sh` and [`FORK_SYNC.md`](./FORK_SYNC.md) — a
  scripted process for pulling upstream Karakeep changes in, documenting
  which of the fork's own files are the real conflict surface (derived from
  an actual diff against the recorded base, not a guess) and what to check
  after merging.

## [0.1.0] — 2026-08-08

First release. Based on upstream Karakeep at
[`764ba85`](https://github.com/karakeep-app/karakeep/commit/764ba85) (~0.33).

Interface-only: no engine, API or data-model changes.

### Added

- **Dense list and grid views** across bookmarks, favourites, archive, lists
  and tags — summary-first rows with source, reading time and tags, infinite
  scroll, sort, and a view toggle that persists per browser.
- **Detail read-out** replacing the stock bookmark preview. Splits list-style
  summaries into a lead paragraph and discrete key points instead of rendering
  raw markdown, and keeps the archived page collapsed until requested.
- **Runtime theme system** — 4 accents × 3 surface tones × 3 reading-emphasis
  levels, switchable from the header, applied live and persisted locally.
  Covers portaled menus and dialogs, not just the page.
- **Settings and profile** brought onto the fork's palette and typography;
  previously these were the only screens still rendering stock Karakeep.
- **Display scaling** that fits the UI to small viewports, with a manual
  85–250% control for deliberate size changes.
- **Quick add** as a modal, reachable with `⌘/Ctrl + E` from anywhere.
- **Accent-aware detail work** — focus rings, text selection, sidebar list
  markers, hover and press transitions all follow the chosen accent.
- IBM Plex Sans and IBM Plex Mono, with mono reserved for metadata and labels.
- Unit tests for the pure helpers: summary parsing, time and URL formatting,
  scale computation, theme palette derivation.
- `docker-compose.search.yml` for running Meilisearch alongside a
  build-from-source setup.

### Fixed

Bugs found and fixed while building the above. The last two affected upstream
behaviour, not just this fork's own code.

- Quick Add ignored the view it was opened from — a bookmark added while
  viewing Favourites, Archive, a list or a tag was created as a plain inbox
  item. The fork never mounted the context provider the create hook reads.
- `⌘/Ctrl + E` did nothing. The dialog advertised the shortcut, but the only
  listener lived inside content that Radix does not mount until the dialog is
  already open.
- The bookmark detail page rendered taller than the viewport (1139px inside an
  860px window) and grew a second scrollbar, because a viewport-unit height was
  re-multiplied by the wrapper's `zoom`.
- Auto-scale scaled *up* on large monitors — a 2560×1440 display computed
  2.3×, rendering every control at 2.3× its designed size. Auto-fit now only
  ever scales down; scaling up is a manual choice.
- Summary text written after a bullet list was silently dropped from the
  detail view.
- "N unsummarised" counted every bookmark on servers without AI configured,
  because it counted anything that was not `success` — including `null`,
  meaning "never queued".
- Dropdown menus rendered off-screen under zoom: Radix writes its position as
  an inline transform, which `zoom` on the same element multiplied.
- `--primary` and `--primary-foreground` were missing from the shadcn variable
  remap, so buttons, badges, switches, sliders and toasts rendered in stock
  near-white instead of the chosen accent — in the dashboard as well as
  settings.
- Avatar fallbacks rendered as solid black circles regardless of theme.
- The search control now shows as disabled when no search backend is
  configured, instead of navigating to a page that throws.
- Adding a bookmark to a smart list is now blocked in the UI rather than
  failing server-side after the bookmark is created.

### Known limitations

- **Build from source only.** No container images are published for this fork
  yet; the inherited release workflows target upstream's registries.
- **Dark only.** The theme axes vary tone and accent, not light versus dark.
- Row titles and summaries cannot be selected, because the whole row is a click
  target.
- Reading time is estimated from summary length, not article content.
- The list header counts loaded items, not the whole collection — the API
  returns no total.
- Search requires Meilisearch; there is no lightweight fallback.

[0.1.0]: https://github.com/HexPum/keepsake-ui/releases/tag/v0.1.0
