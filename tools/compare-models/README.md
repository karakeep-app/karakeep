# Model Comparison Tool

A standalone CLI tool to compare the tagging performance of two AI models using your existing Karakeep bookmarks.

## Features

- Fetches existing bookmarks from your Karakeep instance
- Runs tagging inference on each bookmark with two different models
- **Random shuffling**: Models are randomly assigned to "Model A" or "Model B" for each bookmark to eliminate bias
- Blind comparison: Model names are hidden during voting (only shown as "Model A" and "Model B")
- Interactive voting interface
- Shows final results with winner

## Setup

### Environment Variables

Required environment variables:

```bash
# Karakeep API configuration
KARAKEEP_API_KEY=your_api_key_here
KARAKEEP_SERVER_ADDR=https://your-karakeep-instance.com

# Models to compare
MODEL1_NAME=gpt-4o-mini
MODEL2_NAME=claude-3-5-sonnet

# OpenAI/OpenRouter API configuration (for running inference)
OPENAI_API_KEY=your_openai_or_openrouter_key
OPENAI_BASE_URL=https://openrouter.ai/api/v1  # Optional, defaults to OpenAI

# Optional: Number of bookmarks to test (default: 10)
COMPARE_LIMIT=10
```

### Using OpenRouter

For OpenRouter, set:
```bash
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=your_openrouter_key
```

### Using OpenAI Directly

For OpenAI directly:
```bash
OPENAI_API_KEY=your_openai_key
# OPENAI_BASE_URL can be omitted for direct OpenAI
```

## Usage

### Run with pnpm (Recommended)

```bash
cd tools/compare-models
pnpm install
pnpm run
```

### Run with environment file

Create a `.env` file:

```env
KARAKEEP_API_KEY=your_api_key
KARAKEEP_SERVER_ADDR=https://your-karakeep-instance.com
MODEL1_NAME=gpt-4o-mini
MODEL2_NAME=claude-3-5-sonnet
OPENAI_API_KEY=your_openai_key
COMPARE_LIMIT=10
```

Then run:
```bash
pnpm run
```

### Using directly with node

If you prefer to run the compiled JavaScript directly:

```bash
pnpm build
export KARAKEEP_API_KEY=your_api_key
export KARAKEEP_SERVER_ADDR=https://your-karakeep-instance.com
export MODEL1_NAME=gpt-4o-mini
export MODEL2_NAME=claude-3-5-sonnet
export OPENAI_API_KEY=your_openai_key
node dist/index.js
```

## Usage Flow

1. The tool fetches your latest link bookmarks from Karakeep
2. For each bookmark, it randomly assigns your two models to "Model A" or "Model B" and runs tagging with both
3. You'll see a side-by-side comparison (models are randomly shuffled each time):
   ```
   === Bookmark 1/10 ===
   How to Build Better AI Systems
   https://example.com/article
   This article explores modern approaches to...

   ─────────────────────────────────────

   Model A (blind):
     • ai
     • machine-learning
     • engineering

   Model B (blind):
     • artificial-intelligence
     • ML
     • software-development

   ─────────────────────────────────────

   Which tags do you prefer? [1=Model A, 2=Model B, s=skip, q=quit] >
   ```

4. Choose your preference:
   - `1` - Vote for Model A
   - `2` - Vote for Model B
   - `s` or `skip` - Skip this comparison
   - `q` or `quit` - Exit early and show current results

5. After completing all comparisons (or quitting early), results are displayed:
   ```
   ───────────────────────────────────────
   === FINAL RESULTS ===
   ───────────────────────────────────────
   gpt-4o-mini: 6 votes
   claude-3-5-sonnet: 3 votes
   Skipped: 1
   Errors: 0
   ───────────────────────────────────────
   Total bookmarks tested: 10

   🏆 WINNER: gpt-4o-mini
   ───────────────────────────────────────
   ```

6. The actual model names are only shown in the final results - during voting you see only "Model A" and "Model B"

## Bookmark Filtering

The tool currently tests only:
- **Link-type bookmarks** (not text notes or assets)
- **Non-archived** bookmarks
- **Latest N bookmarks** (where N is COMPARE_LIMIT)

## SDK Usage

This tool uses the Karakeep SDK for all API interactions:
- Type-safe requests using `@karakeep/sdk`
- Proper authentication handling via Bearer token
- Pagination support for fetching multiple bookmarks


## Error Handling

- If a model fails to generate tags for a bookmark, an error is shown and comparison continues
- Errors are counted separately in final results
- Missing required environment variables will cause the tool to exit with a clear error message

## Build

To build a standalone binary:

```bash
pnpm build
```

The built binary will be in `dist/index.js`.

## Notes

- The tool is designed for manual, human-in-the-loop evaluation
- No results are persisted - they're only displayed in console
- Content is fetched with `includeContent=true` from Karakeep API
- Uses Karakeep SDK (`@karakeep/sdk`) for type-safe API interactions
- Inference runs sequentially to keep state management simple
- Recommended to use `pnpm run` for the best experience (uses tsx for development)
- **Random shuffling**: For each bookmark, models are randomly assigned to "Model A" or "Model B" to eliminate position bias. The actual model names are only revealed in the final results.
