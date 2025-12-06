export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitUntil(
  fn: () => Promise<boolean>,
  description: string,
  timeoutMs = 60000,
  intervalMs = 1000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) {
        return;
      }
    } catch {
      // Ignore and retry
    }
    await sleep(intervalMs);
  }
  throw new Error(`${description} timed out after ${timeoutMs}ms`);
}

export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function formatNumber(num: number, fractionDigits = 2): string {
  return num.toFixed(fractionDigits);
}

export function formatMs(ms: number): string {
  return `${formatNumber(ms, ms >= 10 ? 1 : 2)} ms`;
}
