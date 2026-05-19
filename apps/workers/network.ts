import dns from "node:dns/promises";
import { Readable } from "node:stream";
import type { HeadersInit, RequestInit, Response } from "node-fetch";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import ipaddr from "ipaddr.js";
import { LRUCache } from "lru-cache";
import fetch, { Headers } from "node-fetch";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

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

// DNS cache with 5 minute TTL and max 1000 entries
const dnsCache = new LRUCache<string, string[]>({
  max: 1000,
  ttl: 5 * 60 * 1000, // 5 minutes in milliseconds
});

async function resolveHostAddresses(hostname: string): Promise<string[]> {
  const resolver = new dns.Resolver({
    timeout: serverConfig.crawler.ipValidation.dnsResolverTimeoutSec * 1000,
  });

  const results = await Promise.allSettled([
    resolver.resolve4(hostname),
    resolver.resolve6(hostname),
  ]);

  const addresses: string[] = [];
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      addresses.push(...result.value);
    } else {
      const reason = result.reason;
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
  throw new Error(errorMessage);
}

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

export function getBookmarkDomain(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
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

export async function validateUrl(
  urlCandidate: string,
  runningInProxyContext: boolean,
): Promise<UrlValidationResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlCandidate);
  } catch (error) {
    return {
      ok: false,
      reason: `Invalid URL "${urlCandidate}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    } as const;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      reason: `Unsupported protocol for URL: ${parsedUrl.toString()}`,
    } as const;
  }

  const hostname = parsedUrl.hostname;
  if (!hostname) {
    return {
      ok: false,
      reason: `URL ${parsedUrl.toString()} must include a hostname`,
    } as const;
  }

  if (isHostnameAllowedForInternalAccess(hostname)) {
    return { ok: true, url: parsedUrl } as const;
  }

  if (ipaddr.isValid(hostname)) {
    if (isAddressForbidden(hostname)) {
      return {
        ok: false,
        reason: `Refusing to access disallowed IP address ${hostname} (requested via ${parsedUrl.toString()}). You can use CRAWLER_ALLOWED_INTERNAL_HOSTNAMES to allowlist specific hostnames for internal access.`,
      } as const;
    }
    return { ok: true, url: parsedUrl } as const;
  }

  if (runningInProxyContext) {
    // If we're running in a proxy context, we must skip DNS resolution
    // as the DNS resolution will be handled by the proxy
    return { ok: true, url: parsedUrl } as const;
  }

  // Check cache first
  let records = dnsCache.get(hostname);

  if (!records) {
    // Cache miss or expired - perform DNS resolution
    try {
      records = await resolveHostAddresses(hostname);
      dnsCache.set(hostname, records);
    } catch (error) {
      return {
        ok: false,
        reason: `Failed to resolve hostname ${hostname}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      } as const;
    }
  }

  if (!records || records.length === 0) {
    return {
      ok: false,
      reason: `DNS lookup for ${hostname} did not return any addresses (requested via ${parsedUrl.toString()})`,
    } as const;
  }

  for (const record of records) {
    if (isAddressForbidden(record)) {
      return {
        ok: false,
        reason: `Refusing to access disallowed resolved address ${record} for host ${hostname}`,
      } as const;
    }
  }

  return { ok: true, url: parsedUrl } as const;
}

export function getRandomProxy(proxyList: string[]): string {
  return proxyList[Math.floor(Math.random() * proxyList.length)].trim();
}

export function matchesNoProxy(url: string, noProxy: string[]) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    return hostnameMatchesAnyPattern(hostname, noProxy);
  } catch (e) {
    logger.error(`Failed to parse URL: ${url}: ${e}`);
    return false;
  }
}

/**
 * Pre-selected proxy URLs to use consistently across a single crawler run.
 * Created once at the start of a run via `selectRunProxies()`.
 */
export interface RunProxyConfig {
  httpProxy: string | undefined;
  httpsProxy: string | undefined;
  noProxy: string[] | undefined;
}

/**
 * Selects a random proxy from each configured proxy list, to be used
 * consistently for the duration of a single crawler run.
 */
export function selectRunProxies(): RunProxyConfig {
  const { proxy } = serverConfig;
  return {
    httpProxy: proxy.httpProxy ? getRandomProxy(proxy.httpProxy) : undefined,
    httpsProxy: proxy.httpsProxy ? getRandomProxy(proxy.httpsProxy) : undefined,
    noProxy: proxy.noProxy,
  };
}

export function getProxyAgent(url: string, runProxy?: RunProxyConfig) {
  const httpProxy = runProxy
    ? runProxy.httpProxy
    : serverConfig.proxy.httpProxy
      ? getRandomProxy(serverConfig.proxy.httpProxy)
      : undefined;
  const httpsProxy = runProxy
    ? runProxy.httpsProxy
    : serverConfig.proxy.httpsProxy
      ? getRandomProxy(serverConfig.proxy.httpsProxy)
      : undefined;
  const noProxy = runProxy ? runProxy.noProxy : serverConfig.proxy.noProxy;

  if (!httpProxy && !httpsProxy) {
    return undefined;
  }

  const urlObj = new URL(url);
  const protocol = urlObj.protocol;

  // Check if URL should bypass proxy
  if (noProxy && matchesNoProxy(url, noProxy)) {
    return undefined;
  }

  if (protocol === "https:" && httpsProxy) {
    return new HttpsProxyAgent(httpsProxy);
  } else if (protocol === "http:" && httpProxy) {
    return new HttpProxyAgent(httpProxy);
  } else if (httpProxy) {
    return new HttpProxyAgent(httpProxy);
  }

  return undefined;
}

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

function closeResponseBody(response: Response): void {
  const body: unknown = response.body;
  if (!body) {
    return;
  }

  if (body instanceof Readable) {
    body.destroy();
  } else if (
    typeof ReadableStream !== "undefined" &&
    body instanceof ReadableStream
  ) {
    void body.cancel();
  }
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

export const fetchWithProxy = async (
  url: string,
  options: FetchWithProxyOptions = {},
  runProxy?: RunProxyConfig,
) => {
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
    const agent = getProxyAgent(currentUrl, runProxy);

    const validation = await validateUrl(currentUrl, !!agent);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }
    const requestUrl = validation.url;
    currentUrl = requestUrl.toString();

    const response = await fetch(
      currentUrl,
      buildFetchOptions({
        method: currentMethod,
        body: currentBody,
        headers: baseHeaders,
        agent,
        baseOptions,
      }),
    );

    if (!isRedirectResponse(response)) {
      return response;
    }

    const locationHeader = response.headers.get("location");
    if (!locationHeader) {
      return response;
    }

    if (redirectsRemaining <= 0) {
      throw new Error(`Too many redirects while fetching ${url}`);
    }

    const nextUrl = new URL(locationHeader, currentUrl);

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
};

export async function resolveValidatedRedirectUrl(
  url: string,
  options: Pick<
    FetchWithProxyOptions,
    "headers" | "maxRedirects" | "signal"
  > = {},
  runProxy?: RunProxyConfig,
): Promise<URL> {
  const { maxRedirects, baseHeaders, baseOptions } = prepareFetchOptions({
    ...options,
    method: "GET",
  });

  let redirectsRemaining = maxRedirects;
  let currentUrl = url;

  while (true) {
    const signal = options.signal
      ? AbortSignal.any([
          AbortSignal.timeout(5000),
          options.signal as globalThis.AbortSignal,
        ])
      : AbortSignal.timeout(5000);
    const agent = getProxyAgent(currentUrl, runProxy);
    const validation = await validateUrl(currentUrl, !!agent);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    const requestUrl = validation.url;
    currentUrl = requestUrl.toString();

    const response = await fetch(
      currentUrl,
      buildFetchOptions({
        method: "GET",
        headers: baseHeaders,
        agent,
        baseOptions: {
          ...baseOptions,
          signal: signal as RequestInit["signal"],
        },
      }),
    );

    if (!isRedirectResponse(response)) {
      closeResponseBody(response);
      return requestUrl;
    }

    closeResponseBody(response);

    const locationHeader = response.headers.get("location");
    if (!locationHeader) {
      return requestUrl;
    }

    if (redirectsRemaining <= 0) {
      throw new Error(`Too many redirects while resolving ${url}`);
    }

    currentUrl = new URL(locationHeader, currentUrl).toString();
    redirectsRemaining -= 1;
  }
}
