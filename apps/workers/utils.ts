import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from "node-fetch";

import serverConfig from "@karakeep/shared/config";

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

function getProxyAgent(url: string) {
  const { proxy } = serverConfig;

  if (!proxy.httpProxy && !proxy.httpsProxy) {
    return undefined;
  }

  const urlObj = new URL(url);
  const protocol = urlObj.protocol;

  // Check if URL should bypass proxy
  if (proxy.noProxy) {
    const noProxyList = proxy.noProxy.split(",").map((host) => host.trim());
    const hostname = urlObj.hostname;

    for (const noProxyHost of noProxyList) {
      if (
        noProxyHost === hostname ||
        (noProxyHost.startsWith(".") && hostname.endsWith(noProxyHost)) ||
        hostname.endsWith("." + noProxyHost)
      ) {
        return undefined;
      }
    }
  }

  if (protocol === "https:" && proxy.httpsProxy) {
    return new HttpsProxyAgent(proxy.httpsProxy);
  } else if (protocol === "http:" && proxy.httpProxy) {
    return new HttpProxyAgent(proxy.httpProxy);
  } else if (proxy.httpProxy) {
    // Fallback to HTTP proxy for HTTPS if HTTPS proxy not configured
    return new HttpProxyAgent(proxy.httpProxy);
  }

  return undefined;
}

export const fetchWithProxy = (
  url: string,
  options: Record<string, unknown> = {},
) => {
  const agent = getProxyAgent(url);
  if (agent) {
    options.agent = agent;
  }
  return fetch(url, options);
};
