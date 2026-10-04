# Highlight content

Highlights retain their existing `startOffset` and `endOffset` coordinates: offsets count text characters in the reader DOM, with no extra characters for images or block separators. Existing highlights and clients remain valid.

New selections additionally store nullable `content` with `version: 1` and ordered `parts`:

```json
{
  "version": 1,
  "parts": [
    { "type": "text", "text": "Before\n" },
    { "type": "image", "index": 0, "src": "https://example.com/diagram.png", "alt": "Diagram" },
    { "type": "text", "text": "\nAfter" }
  ]
}
```

Image indexes refer to document-order images in the reader content, so repeated URLs remain distinct. Reapplication also checks the URL; an image replaced by a recrawl is not highlighted accidentally. Image-only selections can have equal text offsets. Image parts accept HTTP(S) URLs only and text parts are rendered as text, never HTML.

The `text` field remains a readable fallback with line breaks and bracketed image descriptions for API, CLI and MCP clients. Updating a highlight's note or color preserves its content. Existing rows receive `NULL` when migration `0094_highlight_content` runs; stored text is not reinterpreted as rich content.

Focused regression commands from the repository root:

```sh
pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/components/dashboard/preview/highlight-selection.test.ts apps/web/components/dashboard/preview/highlight-rendering.test.tsx
pnpm exec vitest run --config packages/trpc/vitest.config.ts packages/trpc/routers/highlights.test.ts
pnpm exec vitest run --config packages/shared/vitest.config.ts packages/shared/types/highlights.test.ts
```
