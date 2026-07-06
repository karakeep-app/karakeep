const INSTAGRAM_MEDIA_TYPES = new Set(["p", "reel", "reels", "tv"]);

export interface InstagramContent {
  caption: string;
  transcript: string;
  author: string | null;
  date: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function composeInstagramHtml(content: InstagramContent): string {
  const parts: string[] = [];
  if (content.caption) {
    parts.push(`<p>${escapeHtml(content.caption)}</p>`);
  }
  if (content.transcript) {
    parts.push(`<h2>Transcript</h2>`);
    parts.push(`<p>${escapeHtml(content.transcript)}</p>`);
  }
  const footer = [content.author, content.date].filter(Boolean).join(" · ");
  if (footer) {
    parts.push(`<p><small>${escapeHtml(footer)}</small></p>`);
  }
  return parts.join("\n");
}

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
