const INSTAGRAM_MEDIA_TYPES = new Set(["p", "reel", "reels", "tv"]);

export function isInstagramUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!/(^|\.)instagram\.com$/.test(parsed.hostname)) {
    return false;
  }
  const [type, shortcode] = parsed.pathname.split("/").filter(Boolean);
  return !!shortcode && INSTAGRAM_MEDIA_TYPES.has(type);
}

export function parseVtt(vtt: string): string {
  const out: string[] = [];
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "WEBVTT") continue;
    if (line.includes("-->")) continue; // timestamp cue
    if (/^\d+$/.test(line)) continue; // numeric cue index
    if (line === out[out.length - 1]) continue; // consecutive duplicate
    out.push(line);
  }
  return out.join(" ");
}
