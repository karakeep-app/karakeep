import { describe, expect, it } from "vitest";

import { isMobileAppRedirect, validateRedirectUrl } from "./redirectUrl";

describe("validateRedirectUrl", () => {
  it("should return '/' for null input", () => {
    expect(validateRedirectUrl(null)).toBe("/");
  });

  it("should return '/' for undefined input", () => {
    expect(validateRedirectUrl(undefined)).toBe("/");
  });

  it("should return '/' for empty string", () => {
    expect(validateRedirectUrl("")).toBe("/");
  });

  it("should allow relative paths starting with '/'", () => {
    expect(validateRedirectUrl("/")).toBe("/");
    expect(validateRedirectUrl("/dashboard")).toBe("/dashboard");
    expect(validateRedirectUrl("/settings/profile")).toBe("/settings/profile");
    expect(validateRedirectUrl("/path?query=value")).toBe("/path?query=value");
    expect(validateRedirectUrl("/path#hash")).toBe("/path#hash");
  });

  it("should reject protocol-relative URLs (//)", () => {
    expect(validateRedirectUrl("//evil.com")).toBe("/");
    expect(validateRedirectUrl("//evil.com/path")).toBe("/");
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
    expect(validateRedirectUrl("http://example.com")).toBe("/");
    expect(validateRedirectUrl("http://localhost:3000")).toBe("/");
  });

  it("should reject https:// scheme", () => {
    expect(validateRedirectUrl("https://example.com")).toBe("/");
    expect(validateRedirectUrl("https://evil.com/phishing")).toBe("/");
  });

  it("should reject javascript: scheme", () => {
    expect(validateRedirectUrl("javascript:alert(1)")).toBe("/");
  });

  it("should reject data: scheme", () => {
    expect(
      validateRedirectUrl("data:text/html,<script>alert(1)</script>"),
    ).toBe("/");
  });

  it("should reject other custom schemes", () => {
    expect(validateRedirectUrl("file:///etc/passwd")).toBe("/");
    expect(validateRedirectUrl("ftp://example.com")).toBe("/");
    expect(validateRedirectUrl("mailto:test@example.com")).toBe("/");
  });

  it("should reject paths not starting with /", () => {
    expect(validateRedirectUrl("dashboard")).toBe("/");
    expect(validateRedirectUrl("path/to/page")).toBe("/");
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
