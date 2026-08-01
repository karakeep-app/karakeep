# Configuring different AI Providers

Karakeep uses LLM providers for AI tagging and summarization. We support OpenAI-compatible providers and ollama. This guide will show you how to configure different providers.

## OpenAI

If you want to use OpenAI itself, you just need to pass in the OPENAI_API_KEY environment variable.

```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# You can change the default models by uncommenting the following lines, and choosing your model.
# INFERENCE_TEXT_MODEL=gpt-4.1-mini
# INFERENCE_IMAGE_MODEL=gpt-4o-mini
# EMBEDDING_TEXT_MODEL=text-embedding-3-small
# EMBEDDING_DIMENSIONS=1536
# EMBEDDING_TEXT_MODEL_DIMENSION_OVERRIDE=1536
```


## Ollama

Ollama is a local LLM provider that you can use to run your own LLM server. You'll need to pass ollama's address to karakeep and you need to ensure that it's accessible from within the karakeep container (e.g. no localhost addresses).

Ollama provides two API endpoints:

1. **OpenAI-compatible API (Recommended)** - Uses the `/v1` chat endpoint which handles message formatting automatically
2. **Native Ollama API** - Requires manual formatting for some models

### Option 1: OpenAI-compatible API (Recommended)

This approach uses Ollama's OpenAI-compatible endpoint and is more reliable with various models:

```
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://ollama.mylab.com:11434/v1

# Make sure to pull the models in ollama first. Example models:
INFERENCE_TEXT_MODEL=gemma3
INFERENCE_IMAGE_MODEL=llava
EMBEDDING_TEXT_MODEL=embeddinggemma
EMBEDDING_DIMENSIONS=768
EMBEDDING_CONTEXT_LENGTH=2048
```

### Option 2: Native Ollama API

Alternatively, you can use the native Ollama API:

```
# MAKE SURE YOU DON'T HAVE OPENAI_API_KEY set, otherwise it takes precedence.

OLLAMA_BASE_URL=http://ollama.mylab.com:11434

# Make sure to pull the models in ollama first. Example models:
INFERENCE_TEXT_MODEL=gemma3
INFERENCE_IMAGE_MODEL=llava
EMBEDDING_TEXT_MODEL=embeddinggemma
EMBEDDING_DIMENSIONS=768
EMBEDDING_CONTEXT_LENGTH=2048

# If the model you're using doesn't support structured output, you also need:
# INFERENCE_OUTPUT_SCHEMA=plain
```

:::tip
If you experience issues with certain models (especially OpenAI's gpt-oss models or other models requiring specific chat formats), try using the OpenAI-compatible API endpoint instead.
:::

## Gemini

Gemini has an OpenAI-compatible API. You need to get an api key from Google AI Studio. You also need to set up a billing account, even if using the free tier.

```

OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
OPENAI_API_KEY=YOUR_API_KEY

# Example models:
INFERENCE_TEXT_MODEL=gemini-2.5-flash-lite
INFERENCE_IMAGE_MODEL=gemini-2.5-flash-lite
EMBEDDING_TEXT_MODEL=gemini-embedding-2
EMBEDDING_DIMENSIONS=3072

```

## OpenRouter

```
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=YOUR_API_KEY

# Example models:
INFERENCE_TEXT_MODEL=meta-llama/llama-4-scout
INFERENCE_IMAGE_MODEL=meta-llama/llama-4-scout
EMBEDDING_TEXT_MODEL=openai/text-embedding-3-small
```

## Perplexity

```
OPENAI_BASE_URL=https://api.perplexity.ai
OPENAI_API_KEY=YOUR_PERPLEXITY_API_KEY
INFERENCE_TEXT_MODEL=sonar-pro
INFERENCE_IMAGE_MODEL=sonar-pro
```

## Azure

Azure has an OpenAI-compatible API.

You can get your API key from the Overview page of the Azure AI Foundry Portal or via "Keys + Endpoints" on the resource in the Azure Portal.

:::warning
The [model name is the deployment name](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/switching-endpoints#keyword-argument-for-model) you specified when deploying the model, which may differ from the base model name.
:::

```
# Deployed via Azure AI Foundry:
OPENAI_BASE_URL=https://{your-azure-ai-foundry-resource-name}.cognitiveservices.azure.com/openai/v1/

# Deployed via Azure OpenAI Service:
OPENAI_BASE_URL=https://{your-azure-openai-resource-name}.openai.azure.com/openai/v1/

OPENAI_API_KEY=YOUR_API_KEY
INFERENCE_TEXT_MODEL=YOUR_DEPLOYMENT_NAME
INFERENCE_IMAGE_MODEL=YOUR_DEPLOYMENT_NAME
```

## Cloudflare

Cloudflare supports OpenAI compatible endpoints. You can generate an API Token from the Cloudflare dashboard (Workers AI).

```
OPENAI_BASE_URL=https://api.cloudflare.com/client/v4/accounts/{your-account-id}/ai/v1
OPENAI_API_KEY=Your Cloudflare Workers AI Token

# Example models:
INFERENCE_TEXT_MODEL=@cf/meta/llama-3.1-8b-instruct-fast
INFERENCE_IMAGE_MODEL=@cf/meta/llama-3.2-11b-vision-instruct
EMBEDDING_TEXT_MODEL=@cf/google/embeddinggemma-300m
EMBEDDING_DIMENSIONS=768
EMBEDDING_CONTEXT_LENGTH=2048
INFERENCE_OUTPUT_SCHEMA=json
```


# Configuring Embedding Models

Karakeep uses embedding models for stuff like semantic search and refining tag suggestions. Typically, when you configure an embedding model, you'll want to configure its default num dimensions and context length. Those are done via:

```
EMBEDDING_TEXT_MODEL=
EMBEDDING_DIMENSIONS=
EMBEDDING_CONTEXT_LENGTH=
```


Embeddings can use a different OpenAI-compatible provider. Set either override independently; any unset value falls back to its corresponding `OPENAI_*` setting.

```
EMBEDDING_OPENAI_API_KEY=embedding-provider-api-key
EMBEDDING_OPENAI_BASE_URL=https://embedding-provider.example.com/v1
```

For embedding models that support multiple output sizes, set `EMBEDDING_TEXT_MODEL_DIMENSION_OVERRIDE` to pass the requested dimensions to the provider. Its value must match `EMBEDDING_DIMENSIONS`, which configures the vector store, or Karakeep will fail to start:

```
EMBEDDING_TEXT_MODEL_DIMENSION_OVERRIDE=768
EMBEDDING_DIMENSIONS=768
```

Once you've configured an embedding model, you'll also want to enable auto-embedding generation for your bookmarks by:

```
EMBEDDING_ENABLE_AUTO_INDEXING=true
```

Note: Embeddings from different models are not compatible with each other. If you're to ever change the embedding model or the number of dimensions, you'll need to regenerate embeddings for *all* of your bookmarks.
