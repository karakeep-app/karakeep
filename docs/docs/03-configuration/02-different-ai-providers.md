# Configuring different AI Providers

Karakeep uses LLM providers for AI tagging and summarization. We support multiple providers including OpenAI, Anthropic, Google Gemini, and Ollama for local inference.

## Provider Selection

You can explicitly select a provider using the `INFERENCE_PROVIDER` environment variable:

```
INFERENCE_PROVIDER=openai    # Use OpenAI
INFERENCE_PROVIDER=anthropic # Use Anthropic Claude
INFERENCE_PROVIDER=google    # Use Google Gemini
INFERENCE_PROVIDER=ollama    # Use Ollama (local)
```

If not set, Karakeep will auto-detect based on which API key is configured (checked in the order above).

## OpenAI

```
INFERENCE_PROVIDER=openai  # Optional, auto-detected if OPENAI_API_KEY is set
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Defaults use GPT-5 mini (cost-effective with good quality)
# INFERENCE_TEXT_MODEL=gpt-5-mini
# INFERENCE_IMAGE_MODEL=gpt-5-mini
```

### Supported Models

Karakeep supports all OpenAI models. By default, it uses the `/v1/chat/completions` endpoint for maximum compatibility.

#### GPT-5 Family

| Model | Input | Output | Best For |
|-------|-------|--------|----------|
| `gpt-5.2` | $1.75/1M | $14/1M | Latest (knowledge cutoff: Aug 31, 2025) |
| `gpt-5-pro` | $15/1M | $120/1M | Highest quality, complex reasoning |
| `gpt-5` | $1.25/1M | $10/1M | General purpose |
| `gpt-5-mini` (default) | $0.25/1M | $2/1M | Cost-effective balance |
| `gpt-5-nano` | $0.05/1M | $0.40/1M | Fastest, cheapest |

:::tip
Newer models have more recent training data cutoffs. For summarizing current events, consider `gpt-5.2`.
:::

#### o-series (Legacy Reasoning Models)

GPT-5 models now include reasoning capabilities via `reasoning_effort`, making o-series largely unnecessary. Consider using `gpt-5` or `gpt-5-mini` with `OPENAI_REASONING_EFFORT=medium` instead.

| Model | Notes |
|-------|-------|
| `o1-*`, `o3-*`, `o4-mini` | Still supported but GPT-5 recommended |

#### GPT-4 Family (Legacy)

Still fully supported via Chat Completions:
- `gpt-4.1`, `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`

```
# GPT-5 Pro for highest quality
INFERENCE_TEXT_MODEL=gpt-5-pro
INFERENCE_IMAGE_MODEL=gpt-5-pro

# GPT-5 Nano for lowest cost
INFERENCE_TEXT_MODEL=gpt-5-nano
INFERENCE_IMAGE_MODEL=gpt-5-nano
```

### Responses API (Optional)

For GPT-5 and o-series models, you can enable the newer Responses API (`/v1/responses`) for advanced features like reasoning effort control:

```
OPENAI_USE_RESPONSES_API=true
OPENAI_REASONING_EFFORT=low  # none, minimal, low, medium, high, xhigh
```

| Setting | Behavior |
|---------|----------|
| `OPENAI_USE_RESPONSES_API=false` (default) | Uses Chat Completions for all models |
| `OPENAI_USE_RESPONSES_API=true` | Uses Responses API for `gpt-5*`, `o1*`, `o3*`, `o4*`; Chat Completions for others |

**Reasoning effort notes:**
- `gpt-5.1` defaults to `none` (no reasoning unless specified)
- `gpt-5-pro` only supports `high`
- `xhigh` available for `gpt-5.1-codex-max` and later

### OpenAI-Compatible Providers

For providers with OpenAI-compatible APIs (Azure, OpenRouter, etc.), use the OpenAI provider with a custom base URL:

```
INFERENCE_PROVIDER=openai
OPENAI_API_KEY=YOUR_API_KEY
OPENAI_BASE_URL=https://your-provider-api-endpoint
INFERENCE_TEXT_MODEL=your-model-name
INFERENCE_IMAGE_MODEL=your-model-name
```

#### Azure OpenAI

```
INFERENCE_PROVIDER=openai

# Deployed via Azure AI Foundry:
OPENAI_BASE_URL=https://{your-azure-ai-foundry-resource-name}.cognitiveservices.azure.com/openai/v1/

# Or deployed via Azure OpenAI Service:
# OPENAI_BASE_URL=https://{your-azure-openai-resource-name}.openai.azure.com/openai/v1/

OPENAI_API_KEY=YOUR_API_KEY
INFERENCE_TEXT_MODEL=YOUR_DEPLOYMENT_NAME
INFERENCE_IMAGE_MODEL=YOUR_DEPLOYMENT_NAME
```

:::warning
The [model name is the deployment name](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/switching-endpoints#keyword-argument-for-model) you specified when deploying the model, which may differ from the base model name.
:::

#### OpenRouter

```
INFERENCE_PROVIDER=openai
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=YOUR_API_KEY
INFERENCE_TEXT_MODEL=meta-llama/llama-4-scout
INFERENCE_IMAGE_MODEL=meta-llama/llama-4-scout
```

## Anthropic

Native support for Anthropic's Claude models via the `/v1/messages` API.

```
INFERENCE_PROVIDER=anthropic  # Optional, auto-detected if ANTHROPIC_API_KEY is set
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Recommended models (Claude Sonnet 4.5 is best balance of speed/quality):
INFERENCE_TEXT_MODEL=claude-sonnet-4-5-20250929
INFERENCE_IMAGE_MODEL=claude-sonnet-4-5-20250929

# Alternative: use aliases (auto-updates to latest snapshot)
# INFERENCE_TEXT_MODEL=claude-sonnet-4-5
# INFERENCE_IMAGE_MODEL=claude-sonnet-4-5

# Other options:
# - claude-haiku-4-5-20251001 (fastest, cheapest)
# - claude-opus-4-5-20251101 (most capable)
```

### Claude Model Family

| Model | Input | Output | Best For |
|-------|-------|--------|----------|
| `claude-sonnet-4-5` | $3/1M | $15/1M | Recommended - best balance |
| `claude-haiku-4-5` | $1/1M | $5/1M | Fastest, most cost-effective |
| `claude-opus-4-5` | $5/1M | $25/1M | Most capable, complex reasoning |

### Structured Outputs

Karakeep uses Anthropic's structured outputs feature (beta) with JSON schema for reliable parsing. When a schema is provided, Claude will return validated JSON matching the expected structure.

:::warning Model Requirements
Structured outputs require **Claude 4.5 generation** models:
- `claude-haiku-4-5-*`
- `claude-sonnet-4-5-*` (recommended)
- `claude-opus-4-5-*`

Older models (Claude 3.5, Claude 4.0) do **not** support structured outputs. To use an older model, set `INFERENCE_OUTPUT_SCHEMA=plain`.
:::

:::warning
Anthropic does not provide an embeddings API. If you're using Anthropic for inference and need embeddings (for future semantic search features), you'll need to also configure OpenAI or Google for embeddings:

```
INFERENCE_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# For embeddings, provide an additional API key:
OPENAI_API_KEY=sk-xxx  # Will be used for embeddings
# Or: GEMINI_API_KEY=xxx
```

Karakeep will automatically use the available embedding provider.
:::

## Google Gemini

Native support for Google's Gemini models with structured output via JSON schema. Get an API key from [Google AI Studio](https://aistudio.google.com/).

```
INFERENCE_PROVIDER=google  # Optional, auto-detected if GEMINI_API_KEY is set
GEMINI_API_KEY=YOUR_API_KEY

# Recommended models:
INFERENCE_TEXT_MODEL=gemini-2.5-flash
INFERENCE_IMAGE_MODEL=gemini-2.5-flash
```

### Gemini 3 Family (Preview)

The latest generation with state-of-the-art reasoning and agentic capabilities.

| Model | Input | Output | Best For |
|-------|-------|--------|----------|
| `gemini-3-pro-preview` | $2/1M | $12/1M | Most intelligent, multimodal, agentic |
| `gemini-3-flash-preview` | $0.50/1M | $3/1M | Fast + intelligent, search/grounding |

```
INFERENCE_TEXT_MODEL=gemini-3-flash-preview
INFERENCE_IMAGE_MODEL=gemini-3-flash-preview
```

### Gemini 2.5 Family (Stable)

Production-ready models with excellent price-performance.

| Model | Input | Output | Best For |
|-------|-------|--------|----------|
| `gemini-2.5-pro` | $1.25/1M | $10/1M | Advanced reasoning, complex STEM |
| `gemini-2.5-flash` (recommended) | $0.30/1M | $2.50/1M | Best price-performance |
| `gemini-2.5-flash-lite` | $0.10/1M | $0.40/1M | Fastest, most cost-efficient |

```
# Balanced default
INFERENCE_TEXT_MODEL=gemini-2.5-flash
INFERENCE_IMAGE_MODEL=gemini-2.5-flash

# Budget option
INFERENCE_TEXT_MODEL=gemini-2.5-flash-lite
INFERENCE_IMAGE_MODEL=gemini-2.5-flash-lite

# Maximum quality
INFERENCE_TEXT_MODEL=gemini-2.5-pro
INFERENCE_IMAGE_MODEL=gemini-2.5-pro
```

### Structured Outputs

Karakeep uses Gemini's structured output feature with JSON schema for reliable parsing. When outputting JSON, the model will conform to the expected schema. This is enabled automatically - no additional configuration needed.

## Ollama

Ollama is a local LLM provider that you can use to run your own LLM server. You'll need to pass Ollama's address to Karakeep and ensure it's accessible from within the Karakeep container (e.g., no localhost addresses).

```
INFERENCE_PROVIDER=ollama  # Optional, auto-detected if OLLAMA_BASE_URL is set
OLLAMA_BASE_URL=http://ollama.mylab.com:11434

# Make sure to pull the models in ollama first. Example models:
INFERENCE_TEXT_MODEL=gemma3
INFERENCE_IMAGE_MODEL=llava

# If the model you're using doesn't support structured output, you also need:
# INFERENCE_OUTPUT_SCHEMA=plain
```

## Embeddings Configuration

Embeddings are used for semantic search features. By default, Karakeep uses the same provider for embeddings as for inference (except for Anthropic, which doesn't support embeddings).

You can explicitly set the embedding provider:

```
EMBEDDING_PROVIDER=openai   # Use OpenAI for embeddings
EMBEDDING_PROVIDER=google   # Use Google for embeddings
EMBEDDING_PROVIDER=ollama   # Use Ollama for embeddings

# Customize the embedding model
EMBEDDING_TEXT_MODEL=text-embedding-3-small  # Default for OpenAI
```

## Model Defaults and Recommendations

The defaults are for OpenAI. **You must set model names when using other providers.**

| Provider | Text Model | Image Model | Notes |
|----------|------------|-------------|-------|
| OpenAI (default) | `gpt-5-mini` | `gpt-5-mini` | GPT-5 family; legacy GPT-4 still works |
| Anthropic | `claude-sonnet-4-5-20250929` | `claude-sonnet-4-5-20250929` | Or use alias `claude-sonnet-4-5` |
| Google | `gemini-2.5-flash` | `gemini-2.5-flash` | Stable; `gemini-3-*-preview` for latest |
| Ollama | `gemma3` / `llama3.1` | `llava` | Depends on what you've pulled |

### Embedding Models

| Provider | Model | Notes |
|----------|-------|-------|
| OpenAI | `text-embedding-3-small` (default) | Also: `text-embedding-3-large` |
| Google | `gemini-embedding-001` | Recommended (3072 dims) |
| Ollama | `nomic-embed-text` | Must pull first |
| Anthropic | N/A | Use OpenAI or Google for embeddings |
