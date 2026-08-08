# Changelog

All notable changes to this fork's interface are recorded here. Engine changes
come from [upstream Karakeep](https://github.com/karakeep-app/karakeep) and are
noted by the upstream commit each release is based on.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
