# Effect-ts Integration in Workers

This document describes the Effect-ts integration in the workers codebase, starting with the network layer.

## Overview

We've introduced Effect-ts to improve:
- **Type-safe error handling** with discriminated error types
- **Composable async operations** with Effect pipelines
- **Declarative retries and timeouts** without manual state management
- **Dependency injection** with Layers for better testability
- **Resource safety** with automatic cleanup

## What's Been Done

### 1. Network Layer (`networkEffect.ts`)

A complete Effect-based rewrite of the network layer with:

#### Error Types
- `InvalidUrlError` - URL parsing or validation errors
- `DnsResolutionError` - DNS lookup failures
- `ForbiddenIpError` - SSRF protection (blocked IP addresses)
- `TooManyRedirectsError` - Redirect loop detection
- `HttpRequestError` - HTTP request failures
- `RequestTimeoutError` - Request timeout errors

#### Services
- **DnsResolverService** - DNS resolution with Effect-based caching (5-minute TTL)
- **IpValidatorService** - URL validation and SSRF protection
- **ProxyService** - Proxy agent selection and management
- **HttpClientService** - HTTP client with retry, timeout, and redirect handling

#### Features
- Automatic retry with exponential backoff
- Configurable timeouts
- DNS caching (LRU cache, 5-minute TTL)
- SSRF protection (IP validation)
- Proxy support with rotation
- Custom redirect handling
- Type-safe error handling

## Usage

### Basic Fetch

```typescript
import { fetchUrl, NetworkServiceLive } from "./networkEffect";
import { Effect } from "effect";

const program = fetchUrl("https://example.com").pipe(
  Effect.provide(NetworkServiceLive)
);

const response = await Effect.runPromise(program);
```

### Fetch with Timeout

```typescript
import { fetchUrl, NetworkServiceLive } from "./networkEffect";
import { Effect, Duration } from "effect";

const program = fetchUrl("https://example.com", {
  timeout: Duration.seconds(30),
}).pipe(Effect.provide(NetworkServiceLive));
```

### Fetch with Retry

```typescript
import { fetchUrl, NetworkServiceLive, defaultRetrySchedule } from "./networkEffect";
import { Effect } from "effect";

const program = fetchUrl("https://example.com", {
  retry: defaultRetrySchedule, // 3 retries with exponential backoff
}).pipe(Effect.provide(NetworkServiceLive));
```

### Fetch JSON

```typescript
import { fetchJson, NetworkServiceLive } from "./networkEffect";
import { Effect, Duration } from "effect";

interface ApiResponse {
  status: string;
  data: unknown;
}

const program = fetchJson<ApiResponse>("https://api.example.com/data", {
  timeout: Duration.seconds(10),
  retry: defaultRetrySchedule,
}).pipe(Effect.provide(NetworkServiceLive));
```

### Error Handling

```typescript
import { fetchUrl, NetworkServiceLive } from "./networkEffect";
import { Effect } from "effect";

const program = fetchUrl("https://example.com")
  .pipe(
    Effect.catchTags({
      InvalidUrlError: (error) =>
        Effect.succeed(`Invalid URL: ${error.reason}`),
      ForbiddenIpError: (error) =>
        Effect.succeed(`Blocked IP: ${error.ip}`),
      HttpRequestError: (error) =>
        Effect.succeed(`HTTP error: ${error.reason}`),
    }),
    Effect.provide(NetworkServiceLive),
  );
```

### Complex Workflow

```typescript
import { fetchJson, NetworkServiceLive } from "./networkEffect";
import { Effect, Duration, Schedule } from "effect";

const workflow = Effect.gen(function* () {
  // Fetch user data
  const user = yield* fetchJson("https://api.example.com/user");

  // Fetch user posts (depends on user data)
  const posts = yield* fetchJson(`https://api.example.com/users/${user.id}/posts`);

  // Fetch comments in parallel
  const comments = yield* Effect.all(
    posts.map(post => fetchJson(`https://api.example.com/posts/${post.id}/comments`)),
    { concurrency: 5 }
  );

  return { user, posts, comments };
}).pipe(
  Effect.timeout(Duration.seconds(60)),
  Effect.retry(Schedule.recurs(2)),
  Effect.provide(NetworkServiceLive),
);
```

## Migration Strategy

### Phase 1: Coexistence (Current)
- ✅ New Effect-based network layer (`networkEffect.ts`)
- ✅ Old network layer (`network.ts`) still in use
- Both layers can coexist during gradual migration

### Phase 2: Worker-by-Worker Migration (Recommended)
1. Start with simple workers (e.g., `SearchIndexingWorker`)
2. Gradually migrate complex workflows
3. Update tests to use Effect-based mocks

### Phase 3: Full Migration
1. Remove old `network.ts`
2. Update all workers to use Effect
3. Standardize error handling across workers

## Testing

Effect-based code is much easier to test with dependency injection:

```typescript
import { Layer } from "effect";
import { HttpClientService } from "./networkEffect";

// Create a mock HTTP client
const MockHttpClient = Layer.succeed(HttpClientService, {
  fetch: (url: string) =>
    Effect.succeed({
      status: 200,
      text: () => Promise.resolve("mock response"),
    } as Response),
});

// Use in tests
const testProgram = fetchUrl("https://example.com").pipe(
  Effect.provide(MockHttpClient)
);
```

## Files Created

1. **`networkEffect.ts`** - Effect-based network layer implementation
2. **`networkEffect.example.ts`** - Comprehensive usage examples
3. **`EFFECT_MIGRATION.md`** - This migration guide

## Benefits Over Old Approach

### Before (network.ts)
```typescript
// Manual retry loop
let attempt = 0;
while (attempt < 3) {
  try {
    const response = await fetchWithProxy(url);
    return response;
  } catch (error) {
    attempt++;
    if (attempt >= 3) throw error;
    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
  }
}
```

### After (networkEffect.ts)
```typescript
// Declarative retry
const program = fetchUrl(url, {
  retry: defaultRetrySchedule
}).pipe(Effect.provide(NetworkServiceLive));
```

### Key Improvements

1. **Type Safety**: Errors are typed and can be handled specifically
2. **Composability**: Easy to combine multiple operations
3. **Testability**: Services can be mocked with Layers
4. **Readability**: Declarative approach is easier to understand
5. **Maintainability**: Less manual state management
6. **Resource Safety**: Automatic cleanup with Effect
7. **Observability**: Easy to add logging and metrics

## Next Steps

1. ✅ **Network layer** - COMPLETED
2. **Pick a simple worker** to migrate (recommended: `SearchIndexingWorker`)
3. **Create Effect-based queue runner** abstraction
4. **Migrate complex workers** (e.g., `CrawlerWorker`)
5. **Add Effect-based observability** (logging, metrics)

## Resources

- [Effect Documentation](https://effect.website/)
- [Effect Tutorial](https://effect.website/docs/introduction)
- `networkEffect.example.ts` - Comprehensive examples in this repo

## Questions?

Refer to the examples in `networkEffect.example.ts` for common patterns and best practices.
