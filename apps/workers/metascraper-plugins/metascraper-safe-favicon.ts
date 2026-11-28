import metascraperLogo from "metascraper-logo-favicon";

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
    // Do not use the upstream default resolver for page-provided favicon URLs:
    // it checks reachability with reachable-url/got. This resolver only returns
    // normalized http(s) URLs, so attacker-controlled favicon URLs from the HTML
    // are never fetched from the worker. google: false ensures the upstream
    // plugin never falls back to making network requests either.
    resolveFaviconUrl: resolveSafeFaviconUrl as FaviconResolver,
    google: false,
  });

export default metascraperSafeFavicon;
