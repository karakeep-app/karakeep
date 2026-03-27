export function extractXStatusId(url: string): string | null {
  try {
    const parsed = new URL(url, "https://x.com");
    const isAbsoluteUrl = /^[a-z][a-z\d+\-.]*:/i.test(url);
    if (isAbsoluteUrl) {
      const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
      if (hostname !== "x.com" && hostname !== "twitter.com") {
        return null;
      }
    }

    const pathname = parsed.pathname;
    return pathname.match(/\/status\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}
