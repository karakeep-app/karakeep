import { describe, expect, it } from "vitest";

import { isMobileAppRedirect, validateRedirectUrl } from "./redirectUrl";

describe("validateRedirectUrl", () => {
  it("should return undefined for null input", () => {
    expect(validateRedirectUrl(null)).toBe(undefined);
  });

  it("should return undefined for undefined input", () => {
    expect(validateRedirectUrl(undefined)).toBe(undefined);
  });

  it("should return undefined for empty string", () => {
    expect(validateRedirectUrl("")).toBe(undefined);
  });

  it("should allow relative paths starting with '/'", () => {
    expect(validateRedirectUrl("/")).toBe("/");
    expect(validateRedirectUrl("/dashboard")).toBe("/dashboard");
    expect(validateRedirectUrl("/settings/profile")).toBe("/settings/profile");
    expect(validateRedirectUrl("/path?query=value")).toBe("/path?query=value");
    expect(validateRedirectUrl("/path#hash")).toBe("/path#hash");
  });

  it("should reject protocol-relative URLs (//)", () => {
    expect(validateRedirectUrl("//evil.com")).toBe(undefined);
    expect(validateRedirectUrl("//evil.com/path")).toBe(undefined);
  });

  it("should reject paths that browsers treat as protocol-relative", () => {
    // Browsers normalize "\" to "/" and drop tabs/newlines in URLs.
    expect(validateRedirectUrl("/\\evil.com")).toBe(undefined);
    expect(validateRedirectUrl("/\\/evil.com")).toBe(undefined);
    expect(validateRedirectUrl("/\\\\evil.com/path")).toBe(undefined);
    expect(validateRedirectUrl("/\t/evil.com")).toBe(undefined);
    expect(validateRedirectUrl("/\n/evil.com")).toBe(undefined);
    expect(validateRedirectUrl("/\r\n/evil.com")).toBe(undefined);
  });

  it("should reject paths that normalize to a protocol-relative URL", () => {
    expect(validateRedirectUrl("/a/..//evil.com")).toBe(undefined);
    expect(validateRedirectUrl("/.//evil.com")).toBe(undefined);
    expect(validateRedirectUrl("/a/../\\/evil.com")).toBe(undefined);
    expect(validateRedirectUrl("//redirect-check.invalid//evil.com")).toBe(
      undefined,
    );
    expect(validateRedirectUrl("/\\redirect-check.invalid//evil.com")).toBe(
      undefined,
    );
    expect(validateRedirectUrl("//REDIRECT-CHECK.INVALID:80//evil.com")).toBe(
      undefined,
    );
  });

  it("should keep percent-encoded slashes encoded", () => {
    // Browsers don't decode %2F/%5C in paths, so these stay on-site.
    expect(validateRedirectUrl("/%2F/evil.com")).toBe("/%2F/evil.com");
    expect(validateRedirectUrl("/%5Cevil.com")).toBe("/%5Cevil.com");
  });

  it("should return the normalized same-origin path", () => {
    // Even when the placeholder origin is named, only the path survives.
    expect(validateRedirectUrl("/\\redirect-check.invalid/dashboard")).toBe(
      "/dashboard",
    );
    expect(validateRedirectUrl("/a/../dashboard")).toBe("/dashboard");
    expect(validateRedirectUrl("/a\\b")).toBe("/a/b");
  });

  it("should allow karakeep:// scheme for mobile app", () => {
    expect(validateRedirectUrl("karakeep://")).toBe("karakeep://");
    expect(validateRedirectUrl("karakeep://callback")).toBe(
      "karakeep://callback",
    );
    expect(validateRedirectUrl("karakeep://callback/path")).toBe(
      "karakeep://callback/path",
    );
    expect(validateRedirectUrl("karakeep://callback?param=value")).toBe(
      "karakeep://callback?param=value",
    );
  });

  it("should reject http:// scheme", () => {
    expect(validateRedirectUrl("http://example.com")).toBe(undefined);
    expect(validateRedirectUrl("http://localhost:3000")).toBe(undefined);
  });

  it("should reject https:// scheme", () => {
    expect(validateRedirectUrl("https://example.com")).toBe(undefined);
    expect(validateRedirectUrl("https://evil.com/phishing")).toBe(undefined);
  });

  it("should reject javascript: scheme", () => {
    expect(validateRedirectUrl("javascript:alert(1)")).toBe(undefined);
  });

  it("should reject data: scheme", () => {
    expect(
      validateRedirectUrl("data:text/html,<script>alert(1)</script>"),
    ).toBe(undefined);
  });

  it("should reject other custom schemes", () => {
    expect(validateRedirectUrl("file:///etc/passwd")).toBe(undefined);
    expect(validateRedirectUrl("ftp://example.com")).toBe(undefined);
    expect(validateRedirectUrl("mailto:test@example.com")).toBe(undefined);
  });

  it("should reject paths not starting with /", () => {
    expect(validateRedirectUrl("dashboard")).toBe(undefined);
    expect(validateRedirectUrl("path/to/page")).toBe(undefined);
  });
});

describe("isMobileAppRedirect", () => {
  it("should return true for karakeep:// URLs", () => {
    expect(isMobileAppRedirect("karakeep://")).toBe(true);
    expect(isMobileAppRedirect("karakeep://callback")).toBe(true);
    expect(isMobileAppRedirect("karakeep://callback/path")).toBe(true);
  });

  it("should return false for other URLs", () => {
    expect(isMobileAppRedirect("/")).toBe(false);
    expect(isMobileAppRedirect("/dashboard")).toBe(false);
    expect(isMobileAppRedirect("https://example.com")).toBe(false);
    expect(isMobileAppRedirect("http://localhost")).toBe(false);
  });
});
