# Configuring different AI Providers

Karakeep uses LLM providers for AI tagging and summarization. We support OpenAI-compatible providers and ollama. This guide will show you how to configure different providers.

## OpenAI

If you want to use OpenAI itself, you just need to pass in the OPENAI_API_KEY environment variable.

```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# You can change the default models by uncommenting the following lines, and choosing your model.
# INFERENCE_TEXT_MODEL=gpt-4.1-mini
# INFERENCE_IMAGE_MODEL=gpt-4o-mini
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
```

### Option 2: Native Ollama API

Alternatively, you can use the native Ollama API:

```
# MAKE SURE YOU DON'T HAVE OPENAI_API_KEY set, otherwise it takes precedence.

OLLAMA_BASE_URL=http://ollama.mylab.com:11434

# Make sure to pull the models in ollama first. Example models:
INFERENCE_TEXT_MODEL=gemma3
INFERENCE_IMAGE_MODEL=llava

# If the model you're using doesn't support structured output, you also need:
# INFERENCE_OUTPUT_SCHEMA=plain
```

:::tip
If you experience issues with certain models (especially OpenAI's gpt-oss models or other models requiring specific chat formats), try using the OpenAI-compatible API endpoint instead.
:::

## Gemini

Gemini has an OpenAI-compatible API. You need to get an api key from Google AI Studio.

```

OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
OPENAI_API_KEY=YOUR_API_KEY

# Example models:
INFERENCE_TEXT_MODEL=gemini-2.0-flash
INFERENCE_IMAGE_MODEL=gemini-2.0-flash
```

## OpenRouter

```
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=YOUR_API_KEY

# Example models:
INFERENCE_TEXT_MODEL=meta-llama/llama-4-scout
INFERENCE_IMAGE_MODEL=meta-llama/llama-4-scout
```

## Perplexity

```
OPENAI_BASE_URL: https://api.perplexity.ai
OPENAI_API_KEY: Your Perplexity API Key
INFERENCE_TEXT_MODEL: sonar-pro
INFERENCE_IMAGE_MODEL: sonar-pro
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
INFERENCE_OUTPUT_SCHEMA=json
```
