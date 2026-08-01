import { describe, expect, it } from "vitest";

import { isLikelyChallengePage, resolveMetadata } from "./metadataResolver";

function meta(fields: Record<string, string | null | undefined>) {
  return {
    title: null,
    description: null,
    image: null,
    logo: null,
    author: null,
    publisher: null,
    datePublished: null,
    dateModified: null,
    ...fields,
  };
}

describe("resolveMetadata", () => {
  it("returns render metadata untouched when there is no probe metadata", () => {
    const render = meta({ title: "Render Title" });
    expect(resolveMetadata(render, null, false)).toBe(render);
    expect(resolveMetadata(render, null, true)).toBe(render);
  });

  it("prefers render values and fills gaps from the probe on a healthy render", () => {
    const resolved = resolveMetadata(
      meta({ title: "Render Title", image: null }),
      meta({ title: "Probe Title", image: "https://example.com/probe.png" }),
      false,
    );
    expect(resolved.title).toBe("Render Title");
    expect(resolved.image).toBe("https://example.com/probe.png");
  });

  it("prefers probe values and fills gaps from the render on a blocked render", () => {
    const resolved = resolveMetadata(
      meta({ title: "Just a moment...", author: "Render Author" }),
      meta({ title: "Probe Title", author: null }),
      true,
    );
    expect(resolved.title).toBe("Probe Title");
    expect(resolved.author).toBe("Render Author");
  });

  it("treats empty strings as missing", () => {
    const resolved = resolveMetadata(
      meta({ title: "", description: "" }),
      meta({ title: "Probe Title" }),
      false,
    );
    expect(resolved.title).toBe("Probe Title");
    expect(resolved.description).toBeNull();
  });

  it("preserves extra fields from the render metadata", () => {
    const resolved = resolveMetadata(
      meta({ title: "Render Title", lang: "en" }),
      meta({ title: "Probe Title" }),
      false,
    );
    expect(resolved.lang).toBe("en");
  });

  it("does not mutate its inputs", () => {
    const render = meta({ title: null });
    const probe = meta({ title: "Probe Title" });
    resolveMetadata(render, probe, false);
    expect(render.title).toBeNull();
    expect(probe.title).toBe("Probe Title");
  });
});

describe("isLikelyChallengePage", () => {
  it("detects known challenge-page titles regardless of case and whitespace", () => {
    expect(isLikelyChallengePage({ title: "Just a moment..." })).toBe(true);
    expect(isLikelyChallengePage({ title: "  JUST A MOMENT...  " })).toBe(true);
    expect(
      isLikelyChallengePage({ title: "Attention Required! | Cloudflare" }),
    ).toBe(true);
    expect(isLikelyChallengePage({ title: "Access Denied" })).toBe(true);
    expect(isLikelyChallengePage({ title: "Robot Check" })).toBe(true);
  });

  it("does not match challenge titles as substrings of real titles", () => {
    expect(
      isLikelyChallengePage({
        title: "Access denied: a deep dive into HTTP 403 semantics",
      }),
    ).toBe(false);
  });

  it("detects challenge markers in small page bodies", () => {
    expect(
      isLikelyChallengePage({
        title: "example.com",
        htmlContent: `<html><body><script>window._cf_chl_opt = {};</script></body></html>`,
      }),
    ).toBe(true);
    expect(
      isLikelyChallengePage({
        htmlContent: `<html><body><div id="px-captcha"></div></body></html>`,
      }),
    ).toBe(true);
    expect(
      isLikelyChallengePage({
        htmlContent: `<html><body><iframe src="https://geo.captcha-delivery.com/captcha/"></iframe></body></html>`,
      }),
    ).toBe(true);
    expect(
      isLikelyChallengePage({
        htmlContent: `<html><body><p>Checking your browser before accessing example.com</p></body></html>`,
      }),
    ).toBe(true);
  });

  it("ignores body markers in large documents (e.g. articles quoting them)", () => {
    const article =
      `<html><body><p>Cloudflare shows "checking your browser before accessing" on its interstitial.</p>` +
      `<p>${"lorem ipsum ".repeat(10_000)}</p></body></html>`;
    expect(isLikelyChallengePage({ htmlContent: article })).toBe(false);
  });

  it("does not flag normal pages that merely mention bot-protection vendors", () => {
    expect(
      isLikelyChallengePage({
        title: "How Cloudflare and DataDome detect bots",
        htmlContent:
          "<html><body><p>An overview of Cloudflare, DataDome, PerimeterX and Akamai bot protection.</p></body></html>",
      }),
    ).toBe(false);
  });

  it("returns false for missing inputs", () => {
    expect(isLikelyChallengePage({})).toBe(false);
    expect(isLikelyChallengePage({ title: null, htmlContent: null })).toBe(
      false,
    );
  });
});
