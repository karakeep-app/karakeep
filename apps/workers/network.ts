import dns from "node:dns/promises";
import type { HeadersInit, RequestInit, Response } from "node-fetch";
import {
  Cache,
  Context,
  Duration,
  Effect,
  Either,
  Layer,
  Schema,
} from "effect";
import { UnknownException } from "effect/Cause";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import ipaddr from "ipaddr.js";
import fetch, { Headers } from "node-fetch";

import serverConfig from "@karakeep/shared/config";

class FetchError extends Schema.TaggedError<FetchError>()("FetchError", {
  cause: Schema.Defect,
}) {}

class UrlValidationError extends Schema.TaggedError<UrlValidationError>()(
  "UrlValidationError",
  {
    reason: Schema.String,
  },
) {}

class UrlParseError extends Schema.TaggedError<UrlParseError>()(
  "UrlParseError",
  {
    cause: Schema.Defect,
  },
) {}

class HostAddressResolutionError extends Schema.TaggedError<HostAddressResolutionError>()(
  "HostAddressResolutionError",
  {
    cause: Schema.Array(Schema.Defect),
  },
) {}

const parseUrl = (...param: ConstructorParameters<typeof URL>) =>
  Effect.try({
    try: () => new URL(...param),
    catch: (error) => UrlParseError.make({ cause: error }),
  });

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
  "6to4", // RFC 3056 - IPv6 transition mechanism
  "teredo", // RFC 4380 - IPv6 tunneling
  "benchmarking", // RFC 5180 - benchmarking addresses
  "deprecated", // RFC 3879 - deprecated IPv6 addresses
  "discard", // RFC 6666 - discard-only prefix
]);

interface DnsResolverServiceImpl {
  resolveHostAddresses(
    hostname: string,
  ): Effect.Effect<string[], HostAddressResolutionError>;
}

class DnsResolverService extends Context.Tag(
  "@karakeep/apps/workers/DnsResolverService",
)<DnsResolverService, DnsResolverServiceImpl>() {}

// DNS cache with 5 minute TTL and max 1000 entries
const DnsCache = Cache.make({
  capacity: 1000,
  timeToLive: Duration.minutes(5),
  lookup: (hostname: string) =>
    Effect.gen(function* () {
      const resolver = yield* DnsResolverService;
      yield* Effect.log(`[DnsCacheStore] Resolving ${hostname}`);
      return yield* resolver.resolveHostAddresses(hostname);
    }),
}).pipe(Effect.cached, Effect.flatten);

const DnsResolverLive = Layer.effect(
  DnsResolverService,
  Effect.gen(function* () {
    const resolver = yield* Effect.sync(
      () =>
        new dns.Resolver({
          timeout:
            serverConfig.crawler.ipValidation.dnsResolverTimeoutSec * 1000,
        }),
    );

    const resolveHostAddresses = (hostname: string) =>
      Effect.gen(function* () {
        const results = yield* Effect.all(
          [
            Effect.tryPromise(() => resolver.resolve4(hostname)),
            Effect.tryPromise(() => resolver.resolve6(hostname)),
          ],
          {
            concurrency: "unbounded",
            mode: "either",
          },
        );

        const addresses: string[] = [];
        const errors: UnknownException[] = [];

        for (const result of results) {
          if (Either.isRight(result)) {
            addresses.push(...result.right);
          } else {
            errors.push(result.left);
          }
        }

        if (addresses.length > 0) {
          return addresses;
        }

        return yield* HostAddressResolutionError.make({
          cause: errors,
        });
      });

    return DnsResolverService.of({
      resolveHostAddresses,
    });
  }),
);

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

export type UrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

function hostnameMatchesAnyPattern(
  hostname: string,
  patterns: string[],
): boolean {
  function hostnameMatchesPattern(hostname: string, pattern: string): boolean {
    if (pattern === ".") {
      return true;
    }

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

const validateUrlEffect = (
  urlCandidate: string,
  runningInProxyContext: boolean,
) =>
  Effect.gen(function* () {
    const parsedUrl = yield* parseUrl(urlCandidate);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return yield* UrlValidationError.make({
        reason: `Unsupported protocol for URL`,
      });
    }

    const hostname = parsedUrl.hostname;
    if (!hostname) {
      return yield* UrlValidationError.make({
        reason: `URL must include a hostname`,
      });
    }

    if (isHostnameAllowedForInternalAccess(hostname)) {
      return parsedUrl;
    }

    if (ipaddr.isValid(hostname)) {
      if (isAddressForbidden(hostname)) {
        return yield* UrlValidationError.make({
          reason: `Refusing to access disallowed IP address ${hostname}`,
        });
      }
      return parsedUrl;
    }

    if (runningInProxyContext) {
      // If we're running in a proxy context, we must skip DNS resolution
      // as the DNS resolution will be handled by the proxy
      return parsedUrl;
    }

    const dnsCache = yield* DnsCache;

    // Check cache first
    let records = yield* dnsCache.get(hostname);

    if (!records || records.length === 0) {
      return yield* UrlValidationError.make({
        reason: `DNS lookup for ${hostname} did not return any addresses (requested via ${parsedUrl.toString()})`,
      });
    }

    for (const record of records) {
      if (isAddressForbidden(record)) {
        return yield* UrlValidationError.make({
          reason: `Refusing to access disallowed resolved address ${record} for host ${hostname}`,
        });
      }
    }
    return parsedUrl;
  });

export const validateUrl = (
  urlCandidate: string,
  runningInProxyContext: boolean,
) =>
  validateUrlEffect(urlCandidate, runningInProxyContext).pipe(
    Effect.either,
    Effect.provide(DnsResolverLive),
    Effect.runPromise,
  );

export function getRandomProxy(proxyList: string[]): string {
  return proxyList[Math.floor(Math.random() * proxyList.length)].trim();
}

const matchesNoProxyEffect = (url: string, noProxy: string[]) =>
  Effect.gen(function* () {
    const urlObj = yield* parseUrl(url);
    const hostname = urlObj.hostname;
    return hostnameMatchesAnyPattern(hostname, noProxy);
  }).pipe(Effect.catchTag("UrlParseError", () => Effect.succeed(false)));

export const matchesNoProxy = (url: string, noProxy: string[]) =>
  matchesNoProxyEffect(url, noProxy).pipe(Effect.runSync);

const getProxyAgentEffect = (url: string) =>
  Effect.gen(function* () {
    const { proxy } = serverConfig;

    if (!proxy.httpProxy && !proxy.httpsProxy) {
      return undefined;
    }

    const urlObj = yield* parseUrl(url);
    const protocol = urlObj.protocol;

    // Check if URL should bypass proxy
    if (proxy.noProxy && (yield* matchesNoProxyEffect(url, proxy.noProxy))) {
      return undefined;
    }

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
  });

export const getProxyAgent = (url: string) =>
  getProxyAgentEffect(url).pipe(Effect.runSync);

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

export type FetchWithProxyOptions = Omit<
  RequestInit & {
    maxRedirects?: number;
  },
  "agent"
>;

interface PreparedFetchOptions {
  maxRedirects: number;
  baseHeaders: Headers;
  method: string;
  body?: RequestInit["body"];
  baseOptions: RequestInit;
}

export function prepareFetchOptions(
  options: FetchWithProxyOptions = {},
): PreparedFetchOptions {
  const {
    maxRedirects = 5,
    headers: initHeaders,
    method: initMethod,
    body: initBody,
    redirect: _ignoredRedirect,
    ...restOptions
  } = options;

  const baseOptions = restOptions as RequestInit;

  return {
    maxRedirects,
    baseHeaders: cloneHeaders(initHeaders),
    method: initMethod?.toUpperCase?.() ?? "GET",
    body: initBody,
    baseOptions,
  };
}

interface BuildFetchOptionsInput {
  method: string;
  body?: RequestInit["body"];
  headers: Headers;
  agent?: RequestInit["agent"];
  baseOptions: RequestInit;
}

export function buildFetchOptions({
  method,
  body,
  headers,
  agent,
  baseOptions,
}: BuildFetchOptionsInput): RequestInit {
  return {
    ...baseOptions,
    method,
    body,
    headers,
    agent,
    redirect: "manual",
  };
}

export const fetchWithProxy = (
  url: string,
  options: FetchWithProxyOptions = {},
) =>
  Effect.gen(function* () {
    const {
      maxRedirects,
      baseHeaders,
      method: preparedMethod,
      body: preparedBody,
      baseOptions,
    } = prepareFetchOptions(options);

    let redirectsRemaining = maxRedirects;
    let currentUrl = url;
    let currentMethod = preparedMethod;
    let currentBody = preparedBody;

    while (true) {
      const agent = yield* getProxyAgentEffect(currentUrl);

      const requestUrl = yield* validateUrlEffect(currentUrl, !!agent);
      currentUrl = requestUrl.toString();

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(
            currentUrl,
            buildFetchOptions({
              method: currentMethod,
              body: currentBody,
              headers: baseHeaders,
              agent,
              baseOptions,
            }),
          ),
        catch: (error) => FetchError.make({ cause: error }),
      });

      if (!isRedirectResponse(response)) {
        return response;
      }

      const locationHeader = response.headers.get("location");
      if (!locationHeader) {
        return response;
      }

      if (redirectsRemaining <= 0) {
        return yield* FetchError.make({
          cause: new Error(`Too many redirects while fetching ${url}`),
        });
      }

      const nextUrl = yield* parseUrl(locationHeader, currentUrl);

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
  }).pipe(Effect.provide(DnsResolverLive), Effect.runPromise);
