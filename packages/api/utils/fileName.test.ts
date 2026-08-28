import { describe, expect, it } from "vitest";

import { sanitizeUploadFileName } from "./fileName";

describe("sanitizeUploadFileName", () => {
  it("keeps plain ASCII file names unchanged", () => {
    expect(sanitizeUploadFileName("report (final) v2.pdf")).toBe(
      "report (final) v2.pdf",
    );
  });

  it("preserves non-ASCII letters instead of replacing them", () => {
    // Regression for #3041: every non-ASCII character used to become "_",
    // which is irreversible ("Gr__e" could be "Größe" or "Grüße").
    expect(sanitizeUploadFileName("Prüfung Größe Öl.pdf")).toBe(
      "Prüfung Größe Öl.pdf",
    );
    expect(sanitizeUploadFileName("報告 2026.pdf")).toBe("報告 2026.pdf");
    expect(sanitizeUploadFileName("résumé_日本語.png")).toBe(
      "résumé_日本語.png",
    );
  });

  it("still replaces control characters", () => {
    expect(sanitizeUploadFileName("bad name\n.pdf")).toBe("bad name_.pdf");
    expect(sanitizeUploadFileName("tab\there.txt")).toBe("tab_here.txt");
    expect(sanitizeUploadFileName("nul\u0000del\u007f.txt")).toBe(
      "nul_del_.txt",
    );
  });
});
