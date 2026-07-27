import { describe, expect, test } from "vitest";

import {
  isWeakPdfTitle,
  looksLikeArxivId,
  normalizePdfTitleCandidate,
} from "./pdfTitle";

describe("pdfTitle", () => {
  test("normalizePdfTitleCandidate trims and rejects empty", () => {
    expect(normalizePdfTitleCandidate("  Hello  ")).toBe("Hello");
    expect(normalizePdfTitleCandidate("")).toBeNull();
    expect(normalizePdfTitleCandidate("   ")).toBeNull();
    expect(normalizePdfTitleCandidate(null)).toBeNull();
  });

  test("looksLikeArxivId matches common id shapes", () => {
    expect(looksLikeArxivId("2301.04104")).toBe(true);
    expect(looksLikeArxivId("2301.04104v1")).toBe(true);
    expect(looksLikeArxivId("hep-th/9901001")).toBe(true);
    expect(looksLikeArxivId("Attention Is All You Need")).toBe(false);
    expect(looksLikeArxivId("paper.pdf")).toBe(false);
  });

  test("isWeakPdfTitle treats null, filename, and arxiv ids as weak", () => {
    expect(isWeakPdfTitle(null)).toBe(true);
    expect(isWeakPdfTitle("2301.04104")).toBe(true);
    expect(isWeakPdfTitle("2301.04104", "2301.04104")).toBe(true);
    expect(isWeakPdfTitle("report", "report.pdf")).toBe(true);
    expect(isWeakPdfTitle("report.pdf", "report.pdf")).toBe(true);
    expect(
      isWeakPdfTitle(
        "RAG-MCP: Mitigating Prompt Bloat in LLM Tool Selection",
        "2505.03275",
      ),
    ).toBe(false);
  });
});
