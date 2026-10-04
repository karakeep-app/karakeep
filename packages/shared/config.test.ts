import { describe, expect, it } from "vitest";

import { instagramHeadersSchema } from "./config";

describe("CRAWLER_INSTAGRAM_HEADERS_JSON", () => {
  it("parses a JSON object of string values", () => {
    expect(
      instagramHeadersSchema.parse('{"user-agent":"Mozilla/5.0"}'),
    ).toEqual({ "user-agent": "Mozilla/5.0" });
  });

  it("defaults to an empty object when unset or empty", () => {
    expect(instagramHeadersSchema.parse(undefined)).toEqual({});
    expect(instagramHeadersSchema.parse("")).toEqual({});
  });

  it("reports malformed JSON as an issue without echoing the value", () => {
    const secret = '{"Cookie": "sessionid=SUPERSECRET"';
    const res = instagramHeadersSchema.safeParse(secret);
    expect(res.success).toBe(false);
    const messages = res.error!.issues.map((i) => i.message).join("\n");
    expect(messages).toBe(
      "CRAWLER_INSTAGRAM_HEADERS_JSON must be a JSON object of string values",
    );
    expect(messages).not.toContain("SUPERSECRET");
  });

  it("rejects arrays and non-string values without echoing the value", () => {
    for (const bad of ['["a"]', '{"x": 1}', '"a string"', "null"]) {
      const res = instagramHeadersSchema.safeParse(bad);
      expect(res.success).toBe(false);
      expect(res.error!.issues[0].message).toBe(
        "CRAWLER_INSTAGRAM_HEADERS_JSON must be a JSON object of string values",
      );
    }
  });
});
