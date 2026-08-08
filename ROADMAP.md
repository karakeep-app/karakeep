# Roadmap

Keepsake is a [UI fork of Karakeep](./README.md#what-this-is). This roadmap
covers the interface and the fork's own infrastructure. Engine features —
crawling, AI, API, data model — are tracked
[upstream](https://github.com/karakeep-app/karakeep/issues) and arrive here
through fork syncs.

Items are grouped by confidence, not date. Nothing here is a commitment to a
schedule.

---

## Shipped — 0.1

The interface as it stands today.

- **Dense list and grid views** for bookmarks, favourites, archive, lists and
  tags, with infinite scroll, sort, and a persisted view toggle
- **Detail read-out** replacing the stock preview, including summary parsing
  into a lead paragraph and key points, with the archived page collapsed
  underneath
- **Runtime theme system** — 4 accents × 3 surface tones × 3 reading-emphasis
  levels, applied live and persisted, including portaled menus and dialogs
- **Settings and profile** brought onto the same palette and typography
- **Display scaling** that fits small viewports, with a manual 85–250% control
- **Quick add** as a modal, with a working `⌘/Ctrl + E` shortcut
- **Accent-aware detail work** — focus rings, text selection, list markers,
  hover and press transitions
- Unit tests for the pure helpers (summary parsing, formatting, scaling,
  theming)

## Next

Small, well-understood, and mostly about finishing what 0.1 started.

- **Published container images** so the fork can be run without building from
  source. Requires reworking the inherited release workflows, which currently
  target upstream's registries.
- **Versioned releases** with a changelog, starting at 0.1.0.
- **A documented fork-sync process** — the repository's stated purpose is easy
  upstream merges, and that process should be scripted and written down rather
  than done by hand.
- **Consistent naming.** The interface says Keepsake; application metadata,
  package names and page titles still say Karakeep. Either finish the rename or
  deliberately keep upstream's, but stop doing both.
- **Selectable row text.** Row titles and summaries currently cannot be selected,
  because the whole row is a click target. Worth solving properly rather than
  trading one for the other.
- **Real reading time.** The estimate is currently derived from summary length,
  which is not a meaningful number. Either compute it from article content or
  remove it.
- **Accurate item counts.** The list header counts loaded items, not the
  collection, because the API returns no total.
- **Light theme**, if there is demand. The fork is deliberately dark-only today.

## Under consideration

Ideas from comparable tools, listed with what each would actually involve. None
are started, and some may never be.

### Fits what already exists

- **Reminders and resurfacing** — "remind me in a week", or resurface on a date.
  The rule engine is already event-driven, so this is plausibly a new trigger
  type rather than new infrastructure.
- **Related bookmarks** — surface similar saved items in the detail view using
  the embeddings semantic search already computes. The expensive part exists;
  this is largely a query and a panel.
- **Duplicate detection on save** — currently only checked during bulk import.
  Warning when you save something already saved is a small addition to the
  create path.
- **Tag rename and merge** — there is no endpoint for either today; tags are
  create-on-use only.
- **Highlight review** — highlights are captured but never resurfaced. A review
  surface over existing data, not new capture.

### Larger

- **Manual ordering** — a deliberate "next up" queue, and drag-to-reorder within
  a list. Lists have no user-defined ordering today.
- **Email-forward-to-save** — a per-user inbox address for forwarding
  newsletters. Popular in Omnivore; needs inbound mail handling, so it is a real
  piece of infrastructure rather than a UI change.
- **Custom cover images** per bookmark, overriding what the crawler extracted.
  Needs a schema field.
- **Text-to-speech** for saved articles.

## Non-goals

- **Replacing Karakeep.** This fork tracks upstream and intends to keep doing
  so. Engine work belongs there.
- **Diverging the data model.** Schema changes make syncing harder and are
  avoided unless a feature genuinely cannot work without one.
- **Light-and-dark parity as a constraint on design.** If a light theme
  arrives it will be because someone wants it, not because dark-only is
  considered a defect.
- **Hosted service.** Self-hosting only. Karakeep already offers
  [a managed option](https://cloud.karakeep.app).

---

Suggestions are welcome — open an issue. Interface and theming ideas fit here;
engine ideas will land better
[upstream](https://github.com/karakeep-app/karakeep/issues).
