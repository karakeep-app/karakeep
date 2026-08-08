import { afterEach, describe, expect, it, vi } from "vitest";

import {
  estimateReadingTimeMinutes,
  formatCompactRelativeTime,
  formatRelativeSince,
  formatSavedAgo,
  getDomainFromUrl,
} from "./format";

const NOW = new Date("2026-08-08T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function freezeClock() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("formatCompactRelativeTime", () => {
  it.each([
    [30 * SECOND, "now"],
    [5 * MINUTE, "5m"],
    [3 * HOUR, "3h"],
    [2 * DAY, "2d"],
    [10 * DAY, "1w"],
    [60 * DAY, "2mo"],
    [400 * DAY, "1y"],
  ])("renders %ims ago as %s", (delta, expected) => {
    freezeClock();
    expect(formatCompactRelativeTime(ago(delta))).toBe(expected);
  });

  it("clamps future dates to 'now' rather than going negative", () => {
    freezeClock();
    expect(formatCompactRelativeTime(new Date(NOW.getTime() + HOUR))).toBe(
      "now",
    );
  });
});

describe("formatRelativeSince", () => {
  it.each([
    [10 * SECOND, "just now"],
    [4 * MINUTE, "4 min ago"],
    [5 * HOUR, "5h ago"],
    [3 * DAY, "3d ago"],
  ])("renders %ims ago as %s", (delta, expected) => {
    freezeClock();
    expect(formatRelativeSince(ago(delta))).toBe(expected);
  });
});

describe("formatSavedAgo", () => {
  it.each([
    [2 * HOUR, "saved today"],
    [DAY, "saved 1 day ago"],
    [5 * DAY, "saved 5 days ago"],
    [60 * DAY, "saved 2 months ago"],
    [31 * DAY, "saved 1 month ago"],
    [400 * DAY, "saved 1 year ago"],
  ])("renders %ims ago as %s", (delta, expected) => {
    freezeClock();
    expect(formatSavedAgo(ago(delta))).toBe(expected);
  });
});

describe("getDomainFromUrl", () => {
  it("strips the www prefix", () => {
    expect(getDomainFromUrl("https://www.example.com/a/b")).toBe("example.com");
  });

  it("keeps other subdomains", () => {
    expect(getDomainFromUrl("https://ui.shadcn.com/docs")).toBe(
      "ui.shadcn.com",
    );
  });

  it("returns null for input that isn't a URL", () => {
    expect(getDomainFromUrl("not a url")).toBeNull();
  });
});

describe("estimateReadingTimeMinutes", () => {
  it("returns null when there is no summary to estimate from", () => {
    expect(estimateReadingTimeMinutes(null)).toBeNull();
    expect(estimateReadingTimeMinutes("   ")).toBeNull();
  });

  it("never reports less than a minute for a non-empty summary", () => {
    expect(estimateReadingTimeMinutes("one two three")).toBe(1);
  });
});
