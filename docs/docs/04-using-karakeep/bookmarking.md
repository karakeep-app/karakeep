---
sidebar_position: 1
slug: bookmarking
---

# Bookmarking

Everything in Karakeep starts as a bookmark. Here’s how the different types work and how to keep your home view tidy with favourites and archive.

## Favourites

- Star bookmarks you like so they sit in their own dedicated favourites view for quick return visits.
- Handy for saved gems you want to re-open often like articles you enjoyed, references you come back to, or things worth sharing.

## Archiving

- Archive hides a bookmark from the homepage without deleting it.
- Archived items stay searchable and keep all tags, highlights, and attachments.
- Ideal for achieving inbox-zero style for your homepage.

## Bookmark types

- **Links**: URLs saved from the web or extension. Karakeep grabs metadata, previews, screenshots, and archives when configured.
- **Text**: Quick notes or snippets you paste in. Great for ideas, quotes, or saving context alongside links.
- **Media**: Images or PDFs you want to save for later. Karakeep automatically extracts content out of those files and makes them searchable.

## Notes

- Attach personal notes to any bookmark to capture context, reminders, or next steps.
- Notes live with the bookmark and are searchable, so you can recall why something mattered.

## Highlights

- Save quotes, summaries, or TODOs while reading.
- Highlights show up in the bookmark detail view/reader and are searchable, so you can jump straight to the key ideas.

## Attachments

- Store extra context alongside a bookmark: screenshots, page captures, videos, and files you upload.
- **Screenshots & archives**: fallback when the original page changes or disappear.
- **Uploaded files**: keep PDFs, notes, or supporting assets right with the link.
- Manage attachments from the bookmark detail view: upload, download, or detach as needed.

### Uploading files

Use **Upload File** in an existing bookmark's attachments section. You can select
multiple files, including STL, 3MF, ZIP, and formats without a preview. Uploading
attachments preserves the bookmark's URL, ID, notes, and other attachments.
Generic files appear under their original filenames and download rather than
rendering inline. They are not unpacked, executed, OCRed, or sent for AI processing
or content indexing. Existing image, PDF, and video previews remain supported.
The configured asset size limit, storage quota, and access permissions still apply.

The REST API uses the same two steps for each file:

```sh
curl -H "Authorization: Bearer $KARAKEEP_API_KEY" \
  -F 'purpose=attachment' -F 'file=@part.stl;type=model/stl' \
  "$KARAKEEP_URL/api/v1/assets"

# Use assetId from the upload response and an existing bookmark's ID.
curl -H "Authorization: Bearer $KARAKEEP_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"id":"ASSET_ID","assetType":"userUploaded"}' \
  "$KARAKEEP_URL/api/v1/bookmarks/BOOKMARK_ID/assets"
```

Repeat these steps to attach additional files. Download using
`GET /api/v1/assets/ASSET_ID` or its signed URL. Omitting `purpose` retains the
existing upload restrictions for previews and standalone image/PDF bookmarks.
Generic uploads can only become `userUploaded` attachments, not previews,
page archives, or standalone asset bookmarks.

A detected MIME type takes precedence over the declared multipart type. Declared
types are normalized to lowercase without parameters. If a
preview format recognized by the detector (for example PNG or PDF) is declared but no
format is detected, the upload is rejected. Otherwise, a syntactically valid
declared type is retained for generic files the detector cannot identify (for
example ASCII STL or an empty binary STL); an absent or invalid type falls back to `application/octet-stream`.
File extensions do not determine the MIME type. Only positively detected existing
preview formats can render inline. All other attachment uploads, including HTML
and SVG, retain a download-only flag in storage metadata and are served with
`Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
Unknown binary files need no content parser or new MIME allowlist entry.

Filenames are stored as data, never as storage paths. Download filenames are
percent-encoded in `filename*`; S3 filename metadata is also encoded reversibly
so Unicode names and control characters cannot inject HTTP headers. Existing
assets require no migration. New optional storage metadata is understood by the
updated filesystem and S3 stores; do not downgrade while retaining generic files,
as older servers do not enforce their download-only flag.
