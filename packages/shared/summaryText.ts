import { getEncoding } from "js-tiktoken";

let encoding: ReturnType<typeof getEncoding> | undefined;
export function summaryTokenCount(text: string) {
  encoding ??= getEncoding("o200k_base");
  return encoding.encode(text).length;
}

// Split at Unicode character boundaries, never decode partial UTF-8 token sequences.
export function splitSummarySource(text: string, budget: number): string[] {
  if (budget < 32) throw new Error("Summary context budget too small");
  const points = Array.from(text);
  const parts: string[] = [];
  let start = 0;
  while (start < points.length) {
    let low = 1;
    let high = Math.min(points.length - start, budget * 8);
    let size = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (
        summaryTokenCount(points.slice(start, start + mid).join("")) <= budget
      ) {
        size = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (!size) throw new Error("Summary source cannot fit context");
    parts.push(points.slice(start, start + size).join(""));
    start += size;
  }
  return parts;
}
