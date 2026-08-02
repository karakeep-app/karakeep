# External prompt templates

Karakeep's AI prompts (tagging, summarization, OCR) can be overridden with
plain-text template files, without rebuilding the app. The built-in prompts in
`packages/shared/prompts.ts` remain the defaults; a template file, when
present, fully replaces the corresponding built-in prompt.

The files in this directory are reference copies of the built-in prompts.
Copy the ones you want to change into your prompts directory and edit them.

## Where the app looks for templates

At runtime, the server looks for template files in:

1. `$PROMPTS_DIR`, if the `PROMPTS_DIR` environment variable is set;
2. otherwise `$DATA_DIR/prompts`.

With the standard docker setup (`DATA_DIR=/data` backed by a volume), no extra
configuration is needed — just place files in `/data/prompts/`, e.g.:

```
/data/prompts/text-tagging.txt
/data/prompts/summary.txt
```

Alternatively, mount a host directory and point `PROMPTS_DIR` at it:

```yaml
services:
  web:
    environment:
      PROMPTS_DIR: /etc/karakeep/prompts
    volumes:
      - ./my-prompts:/etc/karakeep/prompts:ro
```

Missing files simply fall back to the built-in prompt, so you only need to
provide the prompts you want to change. Edits to template files are picked up
automatically (files are re-read when their modification time changes) — no
restart needed.

## Template files and their placeholders

| File                | Used for                       | Placeholders |
| ------------------- | ------------------------------ | ------------ |
| `text-tagging.txt`  | Tag suggestions for text/links | `{{lang}}`, `{{content}}`, `{{tagStyle}}`, `{{curatedTags}}`, `{{potentialRelevantTags}}`, `{{customPrompts}}` |
| `image-tagging.txt` | Tag suggestions for images     | `{{lang}}`, `{{tagStyle}}`, `{{curatedTags}}`, `{{potentialRelevantTags}}`, `{{customPrompts}}` |
| `summary.txt`       | Bookmark summarization         | `{{lang}}`, `{{content}}`, `{{customPrompts}}` |
| `ocr.txt`           | LLM-based OCR of images        | (none) |

Placeholder meanings:

- `{{lang}}` — the language configured for AI responses.
- `{{content}}` — the bookmark content (already truncated to fit the model's
  context window).
- `{{tagStyle}}` — the rendered instruction line for the user's configured tag
  style (may be empty).
- `{{curatedTags}}` — the rendered instruction line restricting tags to the
  user's curated list (may be empty).
- `{{potentialRelevantTags}}` — the rendered instruction line suggesting tags
  taken from bookmarks that are similar to this one (found via embeddings).
  Empty when the feature is off or nothing similar was found. Omitting this
  placeholder from a template silently disables the suggestions for that
  prompt.
- `{{customPrompts}}` — the user's custom prompts from the settings page,
  rendered as a `- ` bulleted list (may be empty).

Unknown `{{...}}` placeholders are left in the output verbatim, so typos are
visible when inspecting the generated prompt.

## Notes

- The prompt preview in the web UI's AI settings page reflects file-based
  overrides live, so it's a convenient way to verify a mounted template:
  refresh the page after editing a file and the preview shows exactly what
  will be sent to the AI. (The OCR prompt has no preview in the UI.)
- Keep the JSON output instructions (for the tagging prompts) intact — the
  workers parse the model response as `{"tags": [...]}`.
