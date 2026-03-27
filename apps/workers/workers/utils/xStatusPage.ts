export function extractXStatusId(url: string): string | null {
  try {
    const pathname = new URL(url, "https://x.com").pathname;
    return pathname.match(/\/status\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}
