import { describe, expect, it } from "vitest";

import { parseSummary, summaryPreview } from "./summary";

describe("parseSummary", () => {
  it("treats a plain summary as the lead", () => {
    expect(parseSummary("A single paragraph of prose.")).toEqual({
      lead: "A single paragraph of prose.",
      keyPoints: [],
      trail: null,
    });
  });

  it.each([null, undefined, "", "   \n  "])("returns empty for %p", (input) => {
    expect(parseSummary(input)).toEqual({
      lead: null,
      keyPoints: [],
      trail: null,
    });
  });

  it("splits a lead paragraph from the bullets below it", () => {
    const { lead, keyPoints, trail } = parseSummary(
      "Intro line.\n\n- First point\n- Second point\n- Third point",
    );
    expect(lead).toBe("Intro line.");
    expect(keyPoints).toEqual(["First point", "Second point", "Third point"]);
    expect(trail).toBeNull();
  });

  it.each([
    ["dashes", "- one\n- two"],
    ["asterisks", "* one\n* two"],
    ["bullets", "• one\n• two"],
    ["em dashes", "— one\n— two"],
    ["numbers", "1. one\n2. two"],
    ["numbers with parens", "1) one\n2) two"],
  ])("recognises %s as a list", (_label, input) => {
    expect(parseSummary(input).keyPoints).toEqual(["one", "two"]);
  });

  it("keeps prose that follows the list instead of dropping it", () => {
    const { lead, keyPoints, trail } = parseSummary(
      "Intro.\n- one\n- two\nClosing thought.",
    );
    expect(lead).toBe("Intro.");
    expect(keyPoints).toEqual(["one", "two"]);
    expect(trail).toBe("Closing thought.");
  });

  it("treats a lone bullet as prose rather than a one-item list", () => {
    const summary = "- Only the one point here";
    expect(parseSummary(summary)).toEqual({
      lead: summary,
      keyPoints: [],
      trail: null,
    });
  });

  it("returns a null lead when the summary is nothing but a list", () => {
    const { lead, keyPoints } = parseSummary("- one\n- two");
    expect(lead).toBeNull();
    expect(keyPoints).toEqual(["one", "two"]);
  });

  it("skips empty bullets", () => {
    expect(parseSummary("- one\n-   \n- two").keyPoints).toEqual([
      "one",
      "two",
    ]);
  });
});

describe("summaryPreview", () => {
  it("prefers the lead paragraph so markdown never leaks into a row", () => {
    expect(summaryPreview("Intro.\n- one\n- two")).toBe("Intro.");
  });

  it("runs a bullets-only summary together", () => {
    expect(summaryPreview("- one\n- two")).toBe("one · two");
  });

  it("keeps trailing prose out of a row it has no room for", () => {
    expect(summaryPreview("Intro.\n- one\n- two\nClosing.")).toBe("Intro.");
  });

  it("returns null when there is nothing to show", () => {
    expect(summaryPreview(null)).toBeNull();
  });
});
