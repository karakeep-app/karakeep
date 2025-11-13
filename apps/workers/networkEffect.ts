/**
 * Effect-based network layer for workers
 *
 * This module provides type-safe HTTP operations with:
 * - Typed error handling
 * - Automatic retries with backoff
 * - Configurable timeouts
 * - DNS caching
 * - SSRF protection
 * - Proxy support
 */

import dns from "node:dns/promises";
import { Effect, Context, Layer, Schedule, Cache, Duration, Data } from "effect";
import type { RequestInit, Response, HeadersInit } from "node-fetch";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import ipaddr from "ipaddr.js";
import fetch, { Headers } from "node-fetch";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base class for all network errors
 */
export class NetworkError extends Data.TaggedError("NetworkError")<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Invalid URL error
 */
export class InvalidUrlError extends Data.TaggedError("InvalidUrlError")<{
  url: string;
  reason: string;
}> {}

/**
 * DNS resolution error
 */
export class DnsResolutionError extends Data.TaggedError("DnsResolutionError")<{
  hostname: string;
  reason: string;
}> {}

/**
 * Forbidden IP address error (SSRF protection)
 */
export class ForbiddenIpError extends Data.TaggedError("ForbiddenIpError")<{
  ip: string;
  hostname?: string;
  reason: string;
}> {}

/**
 * Too many redirects error
 */
export class TooManyRedirectsError extends Data.TaggedError(
  "TooManyRedirectsError",
)<{
  url: string;
  maxRedirects: number;
}> {}

/**
 * HTTP request error
 */
export class HttpRequestError extends Data.TaggedError("HttpRequestError")<{
  url: string;
  reason: string;
  cause?: unknown;
}> {}

/**
 * Request timeout error
 */
export class RequestTimeoutError extends Data.TaggedError(
  "RequestTimeoutError",
)<{
  url: string;
  timeoutMs: number;
}> {}

// ============================================================================
// Configuration and Constants
// ============================================================================

const DISALLOWED_IP_RANGES = new Set([
  // IPv4 ranges
  "unspecified",
  "broadcast",
  "multicast",
  "linkLocal",
  "loopback",
  "private",
  "reserved",
  "carrierGradeNat",
  // IPv6 ranges
  "uniqueLocal",
  "6to4",
  "teredo",
  "benchmarking",
  "deprecated",
  "discard",
]);

// ============================================================================
// DNS Resolution Service
// ============================================================================

export interface DnsResolverService {
  readonly resolveHostAddresses: (
    hostname: string,
  ) => Effect.Effect<string[], DnsResolutionError>;
}

export const DnsResolverService = Context.GenericTag<DnsResolverService>(
  "@karakeep/workers/DnsResolverService",
);

/**
 * Live implementation of DNS resolver with caching
 */
export const DnsResolverLive = Layer.effect(
  DnsResolverService,
  Effect.gen(function* () {
    // Create a cache for DNS results with 5 minute TTL
    const dnsCache = yield* Cache.make({
      capacity: 1000,
      timeToLive: Duration.minutes(5),
      lookup: (hostname: string) =>
        Effect.gen(function* () {
          const resolver = new dns.Resolver({
            timeout:
              serverConfig.crawler.ipValidation.dnsResolverTimeoutSec * 1000,
          });

          const results = yield* Effect.all(
            [
              Effect.tryPromise({
                try: () => resolver.resolve4(hostname),
                catch: (error) => error,
              }),
              Effect.tryPromise({
                try: () => resolver.resolve6(hostname),
                catch: (error) => error,
              }),
            ],
            { mode: "either" },
          );

          const addresses: string[] = [];
          const errors: string[] = [];

          for (const result of results) {
            if (result._tag === "Right") {
              addresses.push(...result.right);
            } else {
              const reason = result.left;
              if (reason instanceof Error) {
                errors.push(reason.message);
              } else {
                errors.push(String(reason));
              }
            }
          }

          if (addresses.length > 0) {
            return addresses;
          }

          const errorMessage =
            errors.length > 0
              ? errors.join("; ")
              : "DNS lookup did not return any A or AAAA records";

          return yield* Effect.fail(
            new DnsResolutionError({ hostname, reason: errorMessage }),
          );
        }),
    });

    return {
      resolveHostAddresses: (hostname: string) => dnsCache.get(hostname),
    };
  }),
);

// ============================================================================
// IP Validation Service
// ============================================================================

export interface IpValidatorService {
  readonly isAddressForbidden: (address: string) => boolean;
  readonly validateUrl: (
    url: string,
    runningInProxyContext: boolean,
  ) => Effect.Effect<URL, InvalidUrlError | ForbiddenIpError | DnsResolutionError>;
}

export const IpValidatorService = Context.GenericTag<IpValidatorService>(
  "@karakeep/workers/IpValidatorService",
);

/**
 * Live implementation of IP validator
 */
export const IpValidatorLive = Layer.effect(
  IpValidatorService,
  Effect.gen(function* () {
    const dnsResolver = yield* DnsResolverService;

    function isAddressForbidden(address: string): boolean {
      if (!ipaddr.isValid(address)) {
        return true;
      }
      const parsed = ipaddr.parse(address);
      if (
        parsed.kind() === "ipv6" &&
        (parsed as ipaddr.IPv6).isIPv4MappedAddress()
      ) {
        const mapped = (parsed as ipaddr.IPv6).toIPv4Address();
        return DISALLOWED_IP_RANGES.has(mapped.range());
      }
      return DISALLOWED_IP_RANGES.has(parsed.range());
    }

    function hostnameMatchesAnyPattern(
      hostname: string,
      patterns: string[],
    ): boolean {
      function hostnameMatchesPattern(
        hostname: string,
        pattern: string,
      ): boolean {
        return (
          pattern === hostname ||
          (pattern.startsWith(".") && hostname.endsWith(pattern)) ||
          hostname.endsWith("." + pattern)
        );
      }

      for (const pattern of patterns) {
        if (hostnameMatchesPattern(hostname, pattern)) {
          return true;
        }
      }
      return false;
    }

    function isHostnameAllowedForInternalAccess(hostname: string): boolean {
      if (!serverConfig.allowedInternalHostnames) {
        return false;
      }
      return hostnameMatchesAnyPattern(
        hostname,
        serverConfig.allowedInternalHostnames,
      );
    }

    const validateUrl = (
      urlCandidate: string,
      runningInProxyContext: boolean,
    ): Effect.Effect<URL, InvalidUrlError | ForbiddenIpError | DnsResolutionError> =>
      Effect.gen(function* () {
        // Parse URL
        const parsedUrl = yield* Effect.try({
          try: () => new URL(urlCandidate),
          catch: (error) =>
            new InvalidUrlError({
              url: urlCandidate,
              reason: `Invalid URL: ${error instanceof Error ? error.message : String(error)}`,
            }),
        });

        // Check protocol
        if (
          parsedUrl.protocol !== "http:" &&
          parsedUrl.protocol !== "https:"
        ) {
          return yield* Effect.fail(
            new InvalidUrlError({
              url: urlCandidate,
              reason: `Unsupported protocol: ${parsedUrl.protocol}`,
            }),
          );
        }

        const hostname = parsedUrl.hostname;
        if (!hostname) {
          return yield* Effect.fail(
            new InvalidUrlError({
              url: urlCandidate,
              reason: "URL must include a hostname",
            }),
          );
        }

        // Check if hostname is whitelisted
        if (isHostnameAllowedForInternalAccess(hostname)) {
          return parsedUrl;
        }

        // If it's an IP address, validate it directly
        if (ipaddr.isValid(hostname)) {
          if (isAddressForbidden(hostname)) {
            return yield* Effect.fail(
              new ForbiddenIpError({
                ip: hostname,
                reason: `Refusing to access disallowed IP address ${hostname}`,
              }),
            );
          }
          return parsedUrl;
        }

        // If running in proxy context, skip DNS resolution
        if (runningInProxyContext) {
          return parsedUrl;
        }

        // Resolve hostname and check all IP addresses
        const addresses = yield* dnsResolver.resolveHostAddresses(hostname);

        if (!addresses || addresses.length === 0) {
          return yield* Effect.fail(
            new InvalidUrlError({
              url: urlCandidate,
              reason: `DNS lookup did not return any addresses for ${hostname}`,
            }),
          );
        }

        for (const address of addresses) {
          if (isAddressForbidden(address)) {
            return yield* Effect.fail(
              new ForbiddenIpError({
                ip: address,
                hostname,
                reason: `Refusing to access disallowed resolved address ${address} for host ${hostname}`,
              }),
            );
          }
        }

        return parsedUrl;
      });

    return {
      isAddressForbidden,
      validateUrl,
    };
  }),
);

// ============================================================================
// Proxy Service
// ============================================================================

export interface ProxyService {
  readonly getProxyAgent: (
    url: string,
  ) => HttpProxyAgent<string> | HttpsProxyAgent<string> | undefined;
}

export const ProxyService = Context.GenericTag<ProxyService>(
  "@karakeep/workers/ProxyService",
);

/**
 * Live implementation of proxy service
 */
export const ProxyServiceLive = Layer.succeed(ProxyService, {
  getProxyAgent: (url: string) => {
    const { proxy } = serverConfig;

    if (!proxy.httpProxy && !proxy.httpsProxy) {
      return undefined;
    }

    const urlObj = new URL(url);
    const protocol = urlObj.protocol;

    // Check if URL should bypass proxy
    if (proxy.noProxy) {
      try {
        const hostname = urlObj.hostname;
        const hostnameMatchesAnyPattern = (
          hostname: string,
          patterns: string[],
        ): boolean => {
          const hostnameMatchesPattern = (
            hostname: string,
            pattern: string,
          ): boolean => {
            return (
              pattern === hostname ||
              (pattern.startsWith(".") && hostname.endsWith(pattern)) ||
              hostname.endsWith("." + pattern)
            );
          };

          for (const pattern of patterns) {
            if (hostnameMatchesPattern(hostname, pattern)) {
              return true;
            }
          }
          return false;
        };

        if (hostnameMatchesAnyPattern(hostname, proxy.noProxy)) {
          return undefined;
        }
      } catch (e) {
        logger.error(`Failed to parse URL: ${url}: ${e}`);
      }
    }

    // Select random proxy from list
    const getRandomProxy = (proxyList: string[]): string => {
      return proxyList[Math.floor(Math.random() * proxyList.length)].trim();
    };

    if (protocol === "https:" && proxy.httpsProxy) {
      const selectedProxy = getRandomProxy(proxy.httpsProxy);
      return new HttpsProxyAgent(selectedProxy);
    } else if (protocol === "http:" && proxy.httpProxy) {
      const selectedProxy = getRandomProxy(proxy.httpProxy);
      return new HttpProxyAgent(selectedProxy);
    } else if (proxy.httpProxy) {
      const selectedProxy = getRandomProxy(proxy.httpProxy);
      return new HttpProxyAgent(selectedProxy);
    }

    return undefined;
  },
});

// ============================================================================
// HTTP Client Service
// ============================================================================

export interface HttpClientOptions {
  maxRedirects?: number;
  headers?: HeadersInit;
  method?: string;
  body?: RequestInit["body"];
  timeout?: Duration.DurationInput;
  retry?: Schedule.Schedule<unknown, unknown, unknown>;
}

export interface HttpClientService {
  readonly fetch: (
    url: string,
    options?: HttpClientOptions,
  ) => Effect.Effect<
    Response,
    | InvalidUrlError
    | ForbiddenIpError
    | DnsResolutionError
    | HttpRequestError
    | TooManyRedirectsError
    | RequestTimeoutError
  >;
}

export const HttpClientService = Context.GenericTag<HttpClientService>(
  "@karakeep/workers/HttpClientService",
);

/**
 * Default retry schedule: exponential backoff with jitter
 */
export const defaultRetrySchedule = Schedule.exponential(Duration.millis(100))
  .pipe(Schedule.jittered)
  .pipe(Schedule.compose(Schedule.recurs(3)))
  .pipe(Schedule.intersect(Schedule.spaced(Duration.seconds(1))));

/**
 * Live implementation of HTTP client
 */
export const HttpClientLive = Layer.effect(
  HttpClientService,
  Effect.gen(function* () {
    const ipValidator = yield* IpValidatorService;
    const proxyService = yield* ProxyService;

    function cloneHeaders(init?: HeadersInit): Headers {
      const headers = new Headers();
      if (!init) {
        return headers;
      }
      if (init instanceof Headers) {
        init.forEach((value, key) => {
          headers.set(key, value);
        });
        return headers;
      }

      if (Array.isArray(init)) {
        for (const [key, value] of init) {
          headers.append(key, value);
        }
        return headers;
      }

      for (const [key, value] of Object.entries(init)) {
        if (Array.isArray(value)) {
          headers.set(key, value.join(", "));
        } else if (value !== undefined) {
          headers.set(key, value);
        }
      }

      return headers;
    }

    function isRedirectResponse(response: Response): boolean {
      return (
        response.status === 301 ||
        response.status === 302 ||
        response.status === 303 ||
        response.status === 307 ||
        response.status === 308
      );
    }

    const fetchWithRedirects = (
      url: string,
      options: HttpClientOptions,
    ): Effect.Effect<
      Response,
      | InvalidUrlError
      | ForbiddenIpError
      | DnsResolutionError
      | HttpRequestError
      | TooManyRedirectsError
    > =>
      Effect.gen(function* () {
        const maxRedirects = options.maxRedirects ?? 5;
        const baseHeaders = cloneHeaders(options.headers);
        const baseMethod = options.method?.toUpperCase?.() ?? "GET";

        let redirectsRemaining = maxRedirects;
        let currentUrl = url;
        let currentMethod = baseMethod;
        let currentBody = options.body;

        while (true) {
          const agent = proxyService.getProxyAgent(currentUrl);

          // Validate URL
          const validatedUrl = yield* ipValidator.validateUrl(
            currentUrl,
            !!agent,
          );
          currentUrl = validatedUrl.toString();

          // Make request
          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(currentUrl, {
                method: currentMethod,
                body: currentBody,
                headers: baseHeaders,
                agent,
                redirect: "manual",
              }),
            catch: (error) =>
              new HttpRequestError({
                url: currentUrl,
                reason:
                  error instanceof Error ? error.message : String(error),
                cause: error,
              }),
          });

          // Check if it's a redirect
          if (!isRedirectResponse(response)) {
            return response;
          }

          const locationHeader = response.headers.get("location");
          if (!locationHeader) {
            return response;
          }

          if (redirectsRemaining <= 0) {
            return yield* Effect.fail(
              new TooManyRedirectsError({ url, maxRedirects }),
            );
          }

          // Handle redirect
          const nextUrl = new URL(locationHeader, currentUrl);

          // Update method and body for certain status codes
          if (
            response.status === 303 ||
            ((response.status === 301 || response.status === 302) &&
              currentMethod !== "GET" &&
              currentMethod !== "HEAD")
          ) {
            currentMethod = "GET";
            currentBody = undefined;
            baseHeaders.delete("content-length");
          }

          currentUrl = nextUrl.toString();
          redirectsRemaining -= 1;
        }
      });

    const fetchImpl = (
      url: string,
      options: HttpClientOptions = {},
    ): Effect.Effect<
      Response,
      | InvalidUrlError
      | ForbiddenIpError
      | DnsResolutionError
      | HttpRequestError
      | TooManyRedirectsError
      | RequestTimeoutError
    > => {
      let effect: Effect.Effect<
        Response,
        | InvalidUrlError
        | ForbiddenIpError
        | DnsResolutionError
        | HttpRequestError
        | TooManyRedirectsError
        | RequestTimeoutError
      > = fetchWithRedirects(url, options);

      // Apply timeout if specified
      if (options.timeout) {
        effect = effect.pipe(
          Effect.timeout(options.timeout),
          Effect.catchTag("TimeoutException", () =>
            Effect.fail(
              new RequestTimeoutError({
                url,
                timeoutMs: Duration.toMillis(
                  Duration.decode(options.timeout!),
                ),
              }),
            ),
          ),
        );
      }

      // Apply retry policy if specified
      if (options.retry) {
        effect = effect.pipe(Effect.retry(options.retry)) as typeof effect;
      }

      return effect;
    };

    return {
      fetch: fetchImpl,
    };
  }),
);

// ============================================================================
// Main Layer (combines all services)
// ============================================================================

export const NetworkServiceLive = Layer.mergeAll(
  DnsResolverLive,
  ProxyServiceLive,
).pipe(Layer.provideMerge(IpValidatorLive)).pipe(
  Layer.provideMerge(HttpClientLive),
);

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Fetch a URL with Effect-based error handling
 *
 * @example
 * ```ts
 * const program = fetchUrl("https://example.com", {
 *   timeout: Duration.seconds(30),
 *   retry: defaultRetrySchedule
 * });
 *
 * const response = await Effect.runPromise(
 *   program.pipe(Effect.provide(NetworkServiceLive))
 * );
 * ```
 */
export const fetchUrl = (url: string, options?: HttpClientOptions) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClientService;
    return yield* httpClient.fetch(url, options);
  });

/**
 * Fetch a URL and get the response as text
 */
export const fetchText = (url: string, options?: HttpClientOptions) =>
  Effect.gen(function* () {
    const response = yield* fetchUrl(url, options);
    return yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) =>
        new HttpRequestError({
          url,
          reason: `Failed to read response body: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });
  });

/**
 * Fetch a URL and parse the response as JSON
 */
export const fetchJson = <T = unknown>(
  url: string,
  options?: HttpClientOptions,
) =>
  Effect.gen(function* () {
    const response = yield* fetchUrl(url, options);
    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<T>,
      catch: (error) =>
        new HttpRequestError({
          url,
          reason: `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });
  });
