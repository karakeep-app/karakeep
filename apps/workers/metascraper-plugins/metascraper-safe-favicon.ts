import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import metascraperLogo from "metascraper-logo-favicon";
import { getRandomProxy } from "network";

import serverConfig from "@karakeep/shared/config";

type FaviconResolver = NonNullable<
  Parameters<typeof metascraperLogo>[0]
>["resolveFaviconUrl"];

interface FaviconResolution {
  url: string;
}

async function resolveSafeFaviconUrl(
  faviconUrl: string,
): Promise<FaviconResolution | undefined> {
  let url: URL;
  try {
    url = new URL(faviconUrl);
  } catch {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }

  return { url: url.toString() };
}

const metascraperSafeFavicon = () =>
  metascraperLogo({
    gotOpts: {
      agent: {
        http: serverConfig.proxy.httpProxy
          ? new HttpProxyAgent(getRandomProxy(serverConfig.proxy.httpProxy))
          : undefined,
        https: serverConfig.proxy.httpsProxy
          ? new HttpsProxyAgent(getRandomProxy(serverConfig.proxy.httpsProxy))
          : undefined,
      },
    },
    // Do not use the upstream default resolver for page-provided favicon URLs:
    // it checks reachability with reachable-url/got. This resolver only returns
    // normalized http(s) URLs, so attacker-controlled favicon URLs from the HTML
    // are never fetched from the worker.
    resolveFaviconUrl: resolveSafeFaviconUrl as FaviconResolver,
    google: true,
  });

export default metascraperSafeFavicon;
