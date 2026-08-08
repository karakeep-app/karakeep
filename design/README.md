# Handoff: Karakeep dark-mode frontend — option 1a (dense AI list)

## Overview
A dark-mode redesign of the Karakeep (self-hosted bookmark manager) frontend. The
defining decision: **no thumbnails or image previews anywhere**. Saved items are
represented entirely by their AI-generated title and AI summary, so the list reads
like a briefing rather than a gallery. The target screen is **option 1a — a dense
single-column list** with a collapsible left sidebar.

The prototype file also contains two alternative directions (1b summary cards, 1c
split triage) for reference only. **Implement 1a.** 1b and 1c are useful as a source
of patterns (the icon rail, the detail read-out pane) if the product grows into them.

## About the design files
The files in this bundle are **design references created in HTML** — prototypes that
show intended look and behaviour. They are not production code to copy directly.

The task is to **recreate these designs in the target codebase's environment** using
its established patterns and libraries. Karakeep's own frontend is Next.js + React +
Tailwind + shadcn/ui; if you are extending that, express the tokens below as CSS
variables in the Tailwind theme and build the screens as React components. If you are
starting a new client against the Karakeep API, pick the framework that fits and
implement there. Do not ship the HTML.

Note also that the prototype styles are **inline** and some values were nudged by hand
in a visual editor. Treat the token table below as the source of truth where it
disagrees with a stray inline number.

## Fidelity
**High fidelity.** Colors, typography, spacing and layout are final and should be
matched closely. Interactions are only partly wired in the prototype (see below) —
those are specified in prose here and must be built for real.

---

## Screen: Inbox / file list (option 1a)

### Purpose
The user's main working surface. They scan recently saved items, read enough of each
AI summary to decide what it is, and triage: open, favourite, tag, or archive.

### Frame
The prototype frames the screen at **1000 × 625 px (16:10)**. That is a presentation
frame, not a fixed app size — build it fluid. The sidebar is fixed-width, the content
column flexes.

### Layout
Two columns, `display:flex`, full height.

**Left — sidebar.** Two mutually exclusive states:

- *Expanded*: `width: 153px`, `flex: none`, background `--surface-2`, `border-right:
  1px solid --border`, `padding: 14px 10px`, `box-sizing: border-box`, vertical flex
  with `gap: 16px`.
- *Collapsed (icon rail)*: `width: 58px`, same background/border, `padding: 14px 0`,
  centred column, `gap: 18px`.

**Right — content column.** `flex: 1; min-width: 0;` vertical flex.

### Sidebar contents (expanded, top to bottom)

1. **Brand row** — `display:flex; align-items:center; gap:4px; padding: 0 6px`.
   - Wordmark, 20px / 600 / `letter-spacing: -0.01em`, color `--fg`.
   - Upload/add icon, pushed right (`margin-left:auto`), 18px, color `--accent`.
   - Sidebar-collapse icon, 17px, color `--fg-dim`, **clickable** → collapses to rail.
2. **Primary nav** — vertical flex, `gap: 1px`, `font-size: 12.5px`. Each row:
   `display:flex; align-items:center; gap:9px; padding:5px 8px; border-radius:6px`.
   - Active row: background `--border`, `font-weight: 500`, icon in `--accent`.
   - Inactive row: text `--fg-muted`, icon `--fg-dim`.
   - Items: Inbox (active), Favourites, Archive.
3. **Lists section** — a section label (`font: 500 10px monospace; letter-spacing:
   0.08em; text-transform: uppercase; color: --fg-dim; padding: 0 8px 5px`), then rows
   in the same shape as nav but with a 5px `border-radius:50%` colour dot instead of an
   icon. Dots: Reading `#7ee2b8`, Dev `#8ab4f8`, Ceramics `#d3a8f0`.
4. **Tags section** — same section label, then a `flex-wrap` row of pill chips,
   `gap: 5px`: `border: 1px solid --border; color: --fg-muted; font-size: 11px;
   padding: 2px 7px; border-radius: 999px`.
5. **Footer** — pushed to the bottom with `margin-top: auto`. `display:flex;
   align-items:center; gap:12px; padding:10px 8px 0; border-top: 1px solid --border`.
   Contains a settings icon (16px, `--fg-dim`), a profile icon (16px, `--fg-dim`), and
   a version string pushed right: `font: 400 9.5px monospace; color: #443f3c`, e.g.
   `v0.28.4`. No text labels.

### Sidebar contents (collapsed rail, top to bottom)
Logo mark (19px) → expand icon (17px, `--fg-dim`, clickable) → icon column
(`gap: 15px`, 18px glyphs: inbox in `--accent`, star, archive, tags, upload) → footer
pushed down with `margin-top:auto`: settings, profile, and the version string at
`font: 400 8.5px monospace; color: #4a4844`.

### Content column — header row
`display:flex; align-items:center; gap:14px; padding: 15px 22px 12px`.

- **Left block** — vertical flex, `gap: 3px`:
  - Section label "FILES": `font-size: 15–16px; font-weight: 600; letter-spacing:
    0.06em; text-transform: uppercase; color: #ddd9d4`. It is deliberately set as a
    *label*, not a heading — uppercase and tracked so it does not compete with item
    titles below, which are near the same size.
  - Meta line: `font: 400 11.5px monospace; color: --fg-dim` —
    `24 items · 3 unsummarised · updated 4 min ago`.
- **Right block** — pushed right, `display:flex; align-items:center; gap:10px`:
  - Search pill: `background --surface-1; border 1px solid --border; border-radius:
    9px; padding: 5px 12px; gap: 8px`; 15px search glyph in `--fg-dim` plus the word
    "Search" at 12.5px `--fg-dim`. In the real app this opens a search input; the
    prototype shows the resting state. Keyboard shortcut ⌘K.
  - Two square icon buttons, each `22 × 22px`, `background --surface-1; border 1px
    solid --border; border-radius: 8px; padding: 4px; display:flex; align-items:center;
    justify-content:center`, glyph 20px `--fg-muted`: **upload/add** and
    **filter/adjustments**.
  - A segmented view toggle, `52 × 22px`, same surface/border/radius, containing two
    18px glyphs: list (active — `color: --bg` on a `--accent` background, `padding:3px;
    border-radius:5px`) and grid (inactive — `--fg-muted`).

### Content column — item rows
A vertical stack. Each row: `display:flex; gap:14px; padding:14px 18px; border-top:
1px solid --border-soft`. The first / selected row carries `background: --surface-1`.

**Row body** (`flex:1; min-width:0;` vertical flex, `gap: 6px`):

1. **Title line** — `display:flex; align-items:center; gap:8px`.
   - AI title: `font-size: 14px; font-weight: 550; letter-spacing: -0.01em; color:
     --fg`. This is the AI-generated title, not the page's own `<title>`.
   - Summarised marker: a **sparkles glyph**, 13px, `color: --accent; opacity: 0.65`,
     `title="AI summarised"`. Deliberately quiet — it was a loud "AI" pill in an
     earlier round and dominated the row.
2. **Summary** — `font-size: 12.5px; line-height: 1.55; color: --fg-muted;
   max-width: 640px; text-wrap: pretty`. Two to three lines of AI summary. Inline code
   spans within it render in the mono face at 11.5px, `color: --fg-soft`.
3. **Meta line** — `display:flex; align-items:center; gap:10px; padding-top:2px`:
   domain (`font: 400 11px monospace; color: --fg-dim`), a `·` divider in `#3a3b3e`,
   read time (same mono style), then tag chips: `border: 1px solid --border; color:
   --fg-muted; font-size: 10.5px; padding: 1px 7px; border-radius: 999px`.

**Row trailing block** (`flex:none`, vertical flex, `align-items:flex-end; gap:10px`):
relative timestamp (`font: 400 11px monospace; color: #54524e`) above a row of two
15px action glyphs in `--fg-dim` — star and overflow menu.

### Pending / unsummarised state
An item whose summary has not been generated renders the same row with:
- title in `--fg-soft` instead of `--fg`;
- instead of the sparkles glyph, a status chip: `font: 500 9.5px monospace;
  letter-spacing: 0.06em; color: --fg-dim; border: 1px solid --border; border-radius:
  4px; padding: 1px 5px`, containing a 4px dot and the word `SUMMARISING`;
- instead of summary text, two skeleton bars: `height: 8px; border-radius: 3px;
  background: #1c1d1f`, the second at `width: 72%`, `gap: 6px` between them;
- no read time in the meta line.

---

## Interactions & behaviour
Only the sidebar toggle is wired in the prototype. All of these need building.

| Trigger | Behaviour |
| --- | --- |
| Sidebar collapse / expand icon | Toggles between the 153px sidebar and the 58px rail. **Persist** the choice (localStorage or user prefs) so it survives reload. |
| Row click | Opens the item detail. Prototype 1c shows the intended detail read-out: original URL + saved date, large AI title (25px/600/-0.025em), the original page title shown small for reference, a `SUMMARY` block at 14px/1.65, a `KEY POINTS` list with `—` marks in `--accent`, and the tag row with a dashed `+ tag` affordance. |
| Star glyph | Toggles favourite; optimistic update, revert on failure. |
| Overflow glyph | Menu: open original, archive, edit tags, delete, re-summarise. |
| Re-summarise | Puts the row into the pending state above, then swaps in the new title and summary when the job returns. Poll or subscribe — do not require a manual refresh. |
| Search pill / ⌘K | Opens search over titles, summaries and tags. |
| Filter button | Opens filter controls (list, tag, read/unread, summarised/not). |
| View toggle | Switches list ↔ grid. Grid is prototype 1b: two columns, `gap: 14px`, cards at `background --surface-1; border 1px solid --border; border-radius: 12px; padding: 16px 17px`, with an `AI TITLE` mono label, a 16px/600 title, and the summary at 12.5px/1.6. |
| Nav / list / tag click | Filters the list; the active row takes the active styling above. |
| Hover on a row | Add a background lift toward `--surface-1` and reveal the action glyphs; the prototype shows them always-on for legibility. |

### Responsive
The prototype is fixed-width. At narrow widths, collapse the sidebar to the rail
automatically, then to an off-canvas drawer; drop the summary to two lines clamped;
move the trailing timestamp/action block below the meta line.

### Accessibility
The prototype uses `<div>` and `<i>` throughout. In the real build: rows are links or
buttons, icon controls are `<button>` with accessible names, the sidebar toggle
reports `aria-expanded`, the view toggle is a radio group, and every icon-only control
gets a visible focus ring — derive it from `--accent` at reduced alpha.

---

## State
- `sidebarCollapsed: boolean` — persisted.
- `view: 'list' | 'grid'` — persisted.
- `activeFilter` — inbox | favourites | archive | list id | tag id.
- `query: string` and search results.
- `items[]` — each with id, url, domain, aiTitle, originalTitle, aiSummary,
  keyPoints[], tags[], readingTime, savedAt, favourited, archived,
  `summaryState: 'ready' | 'pending' | 'failed'`.
- `selectedItemId` — drives the detail view.
- Data comes from the Karakeep API; summaries are asynchronous, so items must be able
  to arrive without a summary and gain one later.

---

## Design tokens

### Colour — default theme ("Charcoal")
| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0d0d0e` | App background, active-glyph foreground |
| `--surface-1` | `#141516` | Cards, selected row, controls |
| `--surface-2` | `#111112` | Sidebar |
| `--border` | `#232427` | Control and card borders, chips |
| `--border-soft` | `#1a1b1d` | Row dividers |
| `--accent` | `#7ee2b8` | Active nav, AI markers, primary action |
| `--accent-border` | `color-mix(in oklab, var(--accent) 34%, var(--bg))` | Accent-tinted borders |
| `--fg` | `#eceae7` | Primary text |
| `--fg-soft` | `#c2bfba` | Secondary titles, emphasised inline text |
| `--fg-muted` | `#a9a6a1` | Summary body, chip text |
| `--fg-dim` | `#6d6a65` | Meta, labels, inactive glyphs |
| — | `#54524e` | Timestamps |
| — | `#4a4844` / `#443f3c` | Version string, faintest meta |

Alternate surface tones the prototype ships as a theme switch:
- *True black* — bg `#000000`, surface-1 `#0b0b0c`, surface-2 `#070708`,
  border `#1c1c1e`, border-soft `#141415`.
- *Deep slate* — bg `#0e1116`, surface-1 `#151a21`, surface-2 `#11151c`,
  border `#232b36`, border-soft `#191f27`.

Alternate accents used in the prototype: `#7C5DFF`, `#E8B14C`, `#8AB4F8`.

### Typography
- UI face: **IBM Plex Sans** (400 / 450 / 500 / 550 / 600).
- Mono face: **IBM Plex Mono** (400 / 500) — meta, labels, timestamps, code spans.
- Scale: 25px detail title · 16px card title · 15–16px section label · 14px row title ·
  13px sidebar nav · 12.5px summary and controls · 11.5px meta · 10.5px chips and
  micro-meta · 9.5px status chip · 8.5px rail version.
- Tracking: `-0.025em` on the detail title, `-0.015/-0.02em` on card titles,
  `-0.01em` on row titles and nav, `+0.06em` on the FILES label, `+0.08em` on
  uppercase mono section labels.
- Summary line-height 1.55–1.65; titles 1.22–1.35.

The prototype also carries a **reading-emphasis** theme axis that retunes the balance
between title and summary — worth reproducing as a user preference:

| | Title-led | Balanced | Summary-led |
| --- | --- | --- | --- |
| summary size | 12px | 12.5px | 13.5px |
| detail summary | 13px | 14px | 15.5px |
| index summary | 11px | 11.5px | 12.5px |
| line-height | 1.5 | 1.6 | 1.72 |
| summary colour | `#87847f` | `#a9a6a1` | `#c2bfba` |
| summary strong | `#a9a6a1` | `#c2bfba` | `#ddd9d4` |
| row title weight | 600 | 550 | 500 |
| card title weight | 650 | 600 | 550 |
| card title size | 17px | 16px | 14.5px |

### Spacing
4 / 5 / 6 / 8 / 9 / 10 / 12 / 14 / 16 / 18 / 22 px. Rows `14px 18px`; header
`15px 22px 12px`; sidebar `14px 10px`.

### Radius
`4px` status chip · `5px` active glyph · `6px` nav row · `8px` icon buttons ·
`9px` search pill · `12px` cards · `999px` tag chips.

### Elevation
None inside the UI. Surfaces are separated by borders and background steps only — keep
it that way; shadows would break the flat, minimal read.

---

## Assets
- `karakeep-mark.png` — the spiral logo mark, cut out from a user-supplied image,
  inverted to white on transparency, square-cropped. Used at 17–19px. Replace with a
  proper SVG when one exists.
- Icons are **Tabler Icons** (webfont in the prototype). Glyphs used: `inbox`, `star`,
  `archive`, `hash`, `tag`, `upload`, `plus`, `circle-plus`, `search`, `list`,
  `layout-grid`, `adjustments-horizontal`, `sparkles`, `settings`, `user-circle`,
  `external-link`, `refresh`, `layout-sidebar-left-collapse`,
  `layout-sidebar-left-expand`. Swap the webfont for `@tabler/icons-react` or your
  codebase's icon package.
- Fonts load from Google Fonts; self-host them in production.

## Files in this bundle
- `Karakeep Dark.dc.html` — the prototype. Contains all three options; **1a is the
  one to build**. Open it directly in a browser.
- `support.js` — runtime the prototype needs to render. Not part of the design.
- `karakeep-mark.png` — the logo mark.
- `screenshots/1a-dense-list.png` — **the screen to build**, at 2× .
- `screenshots/1b-summary-cards.png` — the grid view referenced by the view toggle.
- `screenshots/1c-split-triage.png` — the detail read-out referenced by row click.

Note: the screenshots were captured with the violet accent (`#7C5DFF`) selected rather
than the default mint (`#7ee2b8`). Both are valid accents; the token table is the
source of truth for which is default.
