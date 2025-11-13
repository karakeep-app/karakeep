/**
 * Usage examples for the Effect-based network layer
 *
 * This file demonstrates how to use the new Effect-based network layer
 * and shows the improvements over the old approach.
 */

import { Effect, Duration, Schedule } from "effect";
import {
  fetchUrl,
  fetchText,
  fetchJson,
  NetworkServiceLive,
  defaultRetrySchedule,
  HttpClientService,
} from "./networkEffect";

// ============================================================================
// Example 1: Basic fetch with automatic error handling
// ============================================================================

/**
 * OLD APPROACH (network.ts):
 * ```ts
 * try {
 *   const response = await fetchWithProxy("https://example.com");
 *   const text = await response.text();
 * } catch (error) {
 *   // Generic error handling, hard to distinguish error types
 *   logger.error(`Failed to fetch: ${error}`);
 * }
 * ```
 */

/**
 * NEW APPROACH (networkEffect.ts):
 * Typed errors allow you to handle different failure scenarios specifically
 */
export const example1BasicFetch = Effect.gen(function* () {
  const response = yield* fetchUrl("https://example.com");
  return response;
}).pipe(
  // Handle specific error types
  Effect.catchTags({
    InvalidUrlError: (error) =>
      Effect.fail(`Invalid URL: ${error.reason}`),
    ForbiddenIpError: (error) =>
      Effect.fail(`Security: blocked IP ${error.ip}`),
    DnsResolutionError: (error) =>
      Effect.fail(`DNS failed for ${error.hostname}: ${error.reason}`),
    HttpRequestError: (error) =>
      Effect.fail(`HTTP error: ${error.reason}`),
  }),
  // Provide the network service layer
  Effect.provide(NetworkServiceLive),
);

// Run it:
// await Effect.runPromise(example1BasicFetch);

// ============================================================================
// Example 2: Fetch with timeout
// ============================================================================

/**
 * OLD APPROACH:
 * ```ts
 * const controller = new AbortController();
 * const timeoutId = setTimeout(() => controller.abort(), 30000);
 * try {
 *   const response = await fetch(url, { signal: controller.signal });
 *   clearTimeout(timeoutId);
 * } catch (error) {
 *   clearTimeout(timeoutId);
 *   // Handle error
 * }
 * ```
 */

/**
 * NEW APPROACH:
 * Declarative timeout with proper error handling
 */
export const example2FetchWithTimeout = fetchUrl("https://example.com", {
  timeout: Duration.seconds(30),
}).pipe(
  Effect.catchTag("RequestTimeoutError", (error) =>
    Effect.fail(
      `Request timed out after ${error.timeoutMs}ms for ${error.url}`,
    ),
  ),
  Effect.provide(NetworkServiceLive),
);

// ============================================================================
// Example 3: Fetch with retry logic
// ============================================================================

/**
 * OLD APPROACH:
 * ```ts
 * let attempt = 0;
 * let success = false;
 * while (attempt < 3 && !success) {
 *   try {
 *     const response = await fetchWithProxy(url);
 *     success = true;
 *   } catch (error) {
 *     attempt++;
 *     if (attempt < 3) {
 *       await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
 *     }
 *   }
 * }
 * ```
 */

/**
 * NEW APPROACH:
 * Declarative retry with exponential backoff and jitter
 */
export const example3FetchWithRetry = fetchUrl("https://example.com", {
  retry: defaultRetrySchedule, // 3 retries with exponential backoff
}).pipe(Effect.provide(NetworkServiceLive));

// Custom retry policy:
const customRetry = Schedule.exponential(Duration.millis(100))
  .pipe(Schedule.jittered)
  .pipe(Schedule.compose(Schedule.recurs(5))) // 5 retries
  .pipe(Schedule.intersect(Schedule.spaced(Duration.seconds(2)))); // max 2s between retries

export const example3CustomRetry = fetchUrl("https://example.com", {
  retry: customRetry,
}).pipe(Effect.provide(NetworkServiceLive));

// ============================================================================
// Example 4: Fetch JSON with parsing
// ============================================================================

interface ApiResponse {
  status: string;
  data: unknown;
}

/**
 * OLD APPROACH:
 * ```ts
 * try {
 *   const response = await fetchWithProxy(url);
 *   const json = await response.json();
 *   return json;
 * } catch (error) {
 *   logger.error(`Failed: ${error}`);
 *   throw error;
 * }
 * ```
 */

/**
 * NEW APPROACH:
 * Type-safe JSON parsing with error handling
 */
export const example4FetchJson = fetchJson<ApiResponse>(
  "https://api.example.com/data",
  {
    timeout: Duration.seconds(10),
    retry: defaultRetrySchedule,
  },
).pipe(Effect.provide(NetworkServiceLive));

// ============================================================================
// Example 5: Complex workflow with multiple requests
// ============================================================================

/**
 * OLD APPROACH:
 * Nested try-catch blocks, hard to compose
 */

/**
 * NEW APPROACH:
 * Composable effects with automatic error propagation
 */
export const example5ComplexWorkflow = Effect.gen(function* () {
  // Fetch user data
  const userData = yield* fetchJson<{ userId: string }>(
    "https://api.example.com/user",
    {
      timeout: Duration.seconds(10),
    },
  );

  // Fetch user posts (depends on user data)
  const posts = yield* fetchJson<Array<{ id: string; title: string }>>(
    `https://api.example.com/users/${userData.userId}/posts`,
    {
      timeout: Duration.seconds(15),
    },
  );

  // Fetch comments for each post in parallel
  const commentsPromises = posts.map((post) =>
    fetchJson(`https://api.example.com/posts/${post.id}/comments`, {
      timeout: Duration.seconds(5),
    }),
  );

  const comments = yield* Effect.all(commentsPromises, {
    concurrency: 5, // Limit to 5 concurrent requests
  });

  return { userData, posts, comments };
}).pipe(
  // Add retry to the entire workflow
  Effect.retry({
    schedule: Schedule.recurs(2),
    while: (error) =>
      error._tag === "HttpRequestError" ||
      error._tag === "RequestTimeoutError",
  }),
  // Add timeout to the entire workflow
  Effect.timeout(Duration.seconds(60)),
  // Handle errors
  Effect.catchTags({
    TimeoutException: () =>
      Effect.fail("Workflow took too long"),
    HttpRequestError: (error) =>
      Effect.fail(`HTTP error: ${error.reason}`),
  }),
  // Provide the network service layer
  Effect.provide(NetworkServiceLive),
);

// ============================================================================
// Example 6: Using the service directly in a worker
// ============================================================================

/**
 * How to use the HTTP client service in a worker
 */
export const example6WorkerUsage = Effect.gen(function* () {
  // Get the HTTP client service
  const httpClient = yield* HttpClientService;

  // Use it to make requests
  const response = yield* httpClient.fetch("https://example.com", {
    timeout: Duration.seconds(30),
    retry: defaultRetrySchedule,
    headers: {
      "User-Agent": "Karakeep/1.0",
    },
  });

  // Process the response
  const text = yield* Effect.tryPromise(() => response.text());

  return text;
}).pipe(
  // Error handling
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      // Log the error
      yield* Effect.sync(() => {
        console.error("Failed to fetch:", error);
      });
      // Return a default value or fail
      return yield* Effect.succeed("default value");
    }),
  ),
  // Provide the network service layer
  Effect.provide(NetworkServiceLive),
);

// ============================================================================
// Example 7: Testing with mocks
// ============================================================================

/**
 * The Effect-based approach makes testing much easier with dependency injection
 */

import { Layer } from "effect";

// Create a mock HTTP client for testing
import type { Response } from "node-fetch";

const MockHttpClient = Layer.succeed(HttpClientService, {
  fetch: (url: string) =>
    Effect.succeed({
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      ok: true,
      redirected: false,
      type: "basic",
      url,
      text: () => Promise.resolve(`Mock response for ${url}`),
      json: () => Promise.resolve({ mock: true }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      body: null,
      bodyUsed: false,
      clone: function () {
        return this;
      },
      size: 0,
      timeout: 0,
    } as unknown as Response),
});

// For testing, we need to provide all the required services
// We can merge the mock HTTP client with the real DNS and Proxy services
import {
  DnsResolverLive,
  IpValidatorLive,
  ProxyServiceLive
} from "./networkEffect";

const MockNetworkLayer = Layer.mergeAll(
  DnsResolverLive,
  ProxyServiceLive,
).pipe(Layer.provideMerge(IpValidatorLive)).pipe(
  Layer.provideMerge(MockHttpClient),
);

// Use the mock in tests
export const example7TestWithMock = fetchUrl("https://example.com").pipe(
  Effect.provide(MockNetworkLayer),
);

// ============================================================================
// Example 8: Combining with existing code
// ============================================================================

/**
 * You can gradually migrate by wrapping the Effect-based code for use in
 * existing Promise-based code
 */

// Note: For simpler migration, you can create a helper that directly uses the Effect runtime
export const example8MigrationHelper = async (url: string): Promise<string> => {
  // Create a scoped runtime with the network layer
  const program = Effect.gen(function* () {
    const httpClient = yield* HttpClientService;
    const response = yield* httpClient.fetch(url, {
      timeout: Duration.seconds(30),
      retry: defaultRetrySchedule,
    });
    return yield* Effect.tryPromise(() => response.text());
  });

  // Type assertion needed due to Effect-ts Layer type inference limitations
  return Effect.runPromise(
    program.pipe(Effect.provide(NetworkServiceLive)) as Effect.Effect<string, never, never>
  );
};

// Use in existing code:
// const text = await example8MigrationHelper("https://example.com");

// ============================================================================
// Benefits Summary
// ============================================================================

/**
 * Benefits of the Effect-based approach:
 *
 * 1. **Type-safe errors**: Know exactly what can go wrong and handle each case
 * 2. **Composability**: Easy to combine multiple operations
 * 3. **Declarative retries**: No manual loops or state management
 * 4. **Built-in timeouts**: No AbortController dance
 * 5. **Testability**: Easy to mock dependencies with layers
 * 6. **Resource safety**: Automatic cleanup with Effect.acquireRelease
 * 7. **Concurrency control**: Built-in support for parallel operations
 * 8. **Better error propagation**: Errors flow naturally through the pipeline
 * 9. **Observability**: Easy to add logging, metrics, and tracing
 * 10. **Gradual migration**: Can be adopted incrementally
 */
