import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch, { RequestInit } from "node-fetch";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

interface GotRequestOptions {
  url: string | URL;
  agent?: unknown;
}

export function withTimeout<T, Ret>(
  func: (param: T) => Promise<Ret>,
  timeoutSec: number,
) {
  return async (param: T): Promise<Ret> => {
    return await Promise.race([
      func(param),
      new Promise<Ret>((_resolve, reject) =>
        setTimeout(
          () => reject(new Error(`Timed-out after ${timeoutSec} secs`)),
          timeoutSec * 1000,
        ),
      ),
    ]);
  };
}

export function getRandomProxy(proxyList: string[]): string {
  return proxyList[Math.floor(Math.random() * proxyList.length)].trim();
}

function normalizeHost(value: string): string {
  // Lowercase, trim trailing dot, keep leading dot (for subdomain patterns)
  const trimmed = value.trim().toLowerCase();
  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
}

function shouldBypassProxy(
  targetUrl: string,
  noProxyCsv?: string | null,
): boolean {
  if (!noProxyCsv) return false;
  let hostname: string;
  try {
    const urlObj = new URL(targetUrl);
    hostname = normalizeHost(urlObj.hostname);
  } catch {
    // Malformed URL: fail open to use the proxy
    return false;
  }
  // Split, normalize, and skip empty entries
  const noProxyList = noProxyCsv
    .split(",")
    .map((h) => normalizeHost(h))
    .filter((h) => h.length > 0);

  for (const noProxyHost of noProxyList) {
    const base = noProxyHost.startsWith(".")
      ? noProxyHost.slice(1)
      : noProxyHost;
    if (hostname === base || hostname.endsWith("." + base)) {
      return true;
    }
  }
  return false;
}

// Cache proxy agents per proxy URL to preserve connection pooling across calls
// Use a simple LRU with configurable capacity to avoid unbounded growth
const HTTP_AGENT_CACHE_MAX = serverConfig.proxy.agentCacheMax ?? 64;
const HTTPS_AGENT_CACHE_MAX = serverConfig.proxy.agentCacheMax ?? 64;

const httpAgentCache = new Map<string, HttpProxyAgent<string>>();
const httpsAgentCache = new Map<string, HttpsProxyAgent<string>>();

function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  const value = map.get(key);
  if (value !== undefined) {
    // refresh recency by re-inserting
    map.delete(key);
    map.set(key, value);
  }
  return value;
}

function lruSet<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number): void {
  if (map.has(key)) {
    map.delete(key);
  }
  map.set(key, value);
  if (map.size > maxSize) {
    // delete least-recently used (Map iteration preserves insertion order)
    const lruKey = map.keys().next().value as K | undefined;
    if (lruKey !== undefined) {
      const evicted = map.get(lruKey) as unknown as
        | { destroy?: () => void }
        | undefined;
      map.delete(lruKey);
      try {
        evicted?.destroy?.();
      } catch (err) {
        logger.warn(
          `[Proxy] Failed to destroy evicted agent for ${String(lruKey)}: ${String(err)}`,
        );
      }
    }
  }
}

function getProxyAgent(
  url: string,
): HttpProxyAgent<string> | HttpsProxyAgent<string> | undefined {
  const { proxy } = serverConfig;

  if (!proxy.httpProxy && !proxy.httpsProxy) {
    return undefined;
  }

  const urlObj = new URL(url);
  const protocol = urlObj.protocol;

  // Check if URL should bypass proxy
  if (shouldBypassProxy(url, proxy.noProxy)) {
    return undefined;
  }

  if (protocol === "https:" && proxy.httpsProxy) {
    const selectedProxy = getRandomProxy(proxy.httpsProxy);
    const cached = lruGet(httpsAgentCache, selectedProxy);
    if (cached) return cached;
    const agent = new HttpsProxyAgent(selectedProxy);
    lruSet(httpsAgentCache, selectedProxy, agent, HTTPS_AGENT_CACHE_MAX);
    return agent;
  } else if (protocol === "http:" && proxy.httpProxy) {
    const selectedProxy = getRandomProxy(proxy.httpProxy);
    const cached = lruGet(httpAgentCache, selectedProxy);
    if (cached) return cached;
    const agent = new HttpProxyAgent(selectedProxy);
    lruSet(httpAgentCache, selectedProxy, agent, HTTP_AGENT_CACHE_MAX);
    return agent;
  } else if (protocol === "http:" && proxy.httpsProxy) {
    // HTTP destination via HTTPS proxy
    const selectedProxy = getRandomProxy(proxy.httpsProxy);
    const cached = lruGet(httpAgentCache, selectedProxy);
    if (cached) return cached;
    const agent = new HttpProxyAgent(selectedProxy);
    lruSet(httpAgentCache, selectedProxy, agent, HTTP_AGENT_CACHE_MAX);
    return agent;
  } else if (protocol === "https:" && proxy.httpProxy) {
    // Fallback: use HTTPS proxy agent (CONNECT tunnel) for HTTPS destinations via HTTP proxy
    const selectedProxy = getRandomProxy(proxy.httpProxy);
    const cached = lruGet(httpsAgentCache, selectedProxy);
    if (cached) return cached;
    const agent = new HttpsProxyAgent(selectedProxy);
    lruSet(httpsAgentCache, selectedProxy, agent, HTTPS_AGENT_CACHE_MAX);
    return agent;
  }

  return undefined;
}

function isRequestLike(value: unknown): value is { url: string } {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec["url"] === "string";
}

export const fetchWithProxy = (
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
) => {
  const urlString =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : isRequestLike(input)
          ? (input.url as string)
          : String(input);
  const agent = getProxyAgent(urlString);
  const nextInit: RequestInit = { ...init };
  if (agent) {
    nextInit.agent = agent;
  }
  return fetch(input, nextInit);
};

// Returns Got-compatible agent options. If the target URL matches noProxy, no agent is returned.
export function getGotProxyAgentOptions(targetUrlForNoProxyCheck?: string):
  | {
      agent: {
        http?: HttpProxyAgent<string>;
        https?: HttpProxyAgent<string> | HttpsProxyAgent<string>;
      };
      hooks?: {
        beforeRequest?: ((options: GotRequestOptions) => void)[];
        beforeRedirect?: ((options: GotRequestOptions) => void)[];
      };
    }
  | undefined {
  const { proxy } = serverConfig;

  if (!proxy.httpProxy && !proxy.httpsProxy) {
    return undefined;
  }

  // Respect noProxy if a target URL is provided for host matching
  if (
    targetUrlForNoProxyCheck &&
    shouldBypassProxy(targetUrlForNoProxyCheck, proxy.noProxy)
  ) {
    return undefined;
  }

  // Build http/https agents, mirroring fetch proxy selection logic
  const agents: {
    http?: HttpProxyAgent<string>;
    https?: HttpProxyAgent<string> | HttpsProxyAgent<string>;
  } = {};

  if (proxy.httpProxy && proxy.httpProxy.length > 0) {
    const httpProxyUrl = getRandomProxy(proxy.httpProxy);
    const cached = lruGet(httpAgentCache, httpProxyUrl);
    const httpAgent = cached ?? new HttpProxyAgent(httpProxyUrl);
    if (!cached) {
      lruSet(httpAgentCache, httpProxyUrl, httpAgent, HTTP_AGENT_CACHE_MAX);
    }
    agents.http = httpAgent;
    // Use HTTPS proxy agent (CONNECT tunnel) for HTTPS destinations via HTTP proxy
    const cachedHttps = lruGet(httpsAgentCache, httpProxyUrl);
    const httpsAgent = cachedHttps ?? new HttpsProxyAgent(httpProxyUrl);
    if (!cachedHttps) {
      lruSet(httpsAgentCache, httpProxyUrl, httpsAgent, HTTPS_AGENT_CACHE_MAX);
    }
    agents.https = httpsAgent;
  }

  if (proxy.httpsProxy && proxy.httpsProxy.length > 0) {
    const httpsProxyUrl = getRandomProxy(proxy.httpsProxy);
    // Support HTTP destinations via HTTPS proxy
    if (!agents.http) {
      const cachedHttp = lruGet(httpAgentCache, httpsProxyUrl);
      const httpAgent = cachedHttp ?? new HttpProxyAgent(httpsProxyUrl);
      if (!cachedHttp) {
        lruSet(httpAgentCache, httpsProxyUrl, httpAgent, HTTP_AGENT_CACHE_MAX);
      }
      agents.http = httpAgent;
    }
    const cached = lruGet(httpsAgentCache, httpsProxyUrl);
    const httpsAgent = cached ?? new HttpsProxyAgent(httpsProxyUrl);
    if (!cached) {
      lruSet(httpsAgentCache, httpsProxyUrl, httpsAgent, HTTPS_AGENT_CACHE_MAX);
    }
    agents.https = httpsAgent;
  }

  if (Object.keys(agents).length === 0) {
    return undefined;
  }

  // Dynamically bypass proxy for both initial request and redirects
  const hooks = proxy.noProxy
    ? {
        beforeRequest: [
          (options: GotRequestOptions) => {
            try {
              const urlStr =
                typeof options.url === "string"
                  ? options.url
                  : options.url.toString();
              if (shouldBypassProxy(urlStr, proxy.noProxy)) {
                options.agent = undefined;
              } else {
                options.agent = agents;
              }
            } catch (error) {
              const urlVal = (options as unknown as { url?: unknown })?.url;
              logger.warn(
                `[Proxy] beforeRequest hook error for URL ${String(urlVal)}: ${String(error)}`,
              );
            }
          },
        ],
        beforeRedirect: [
          (options: GotRequestOptions) => {
            try {
              const urlStr =
                typeof options.url === "string"
                  ? options.url
                  : options.url.toString();
              if (shouldBypassProxy(urlStr, proxy.noProxy)) {
                options.agent = undefined;
              } else {
                options.agent = agents;
              }
            } catch (error) {
              const urlVal = (options as unknown as { url?: unknown })?.url;
              logger.warn(
                `[Proxy] beforeRedirect hook error for URL ${String(urlVal)}: ${String(error)}`,
              );
            }
          },
        ],
      }
    : undefined;

  return { agent: agents, hooks };
}
