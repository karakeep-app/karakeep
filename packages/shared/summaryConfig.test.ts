import { describe, expect, it } from "vitest";

import { clientConfig, serverConfigSchema } from "./config";

const configured = {
  SUMMARY_PROVIDER: "notebooklm",
  SUMMARY_NOTEBOOKLM_URL: "http://notebooklm:8000",
  SUMMARY_NOTEBOOKLM_TOKEN: "private-notebook-token",
  SUMMARY_HERMES_URL: "http://hermes:8642/v1",
  SUMMARY_HERMES_API_KEY: "private-hermes-key",
  SUMMARY_HERMES_MODEL: "summary",
};

describe("summary configuration", () => {
  it("keeps legacy inference and reader behavior by default", () => {
    const parsed = serverConfigSchema.parse({});
    expect(parsed.summary.provider).toBe("legacy");
    expect(parsed.summary.readerEnabled).toBe(false);
    expect(parsed.summary.autoTagsEnabled).toBe(false);
    expect(parsed.summary.jobTimeoutSec).toBeGreaterThan(
      parsed.summary.notebooklmTimeoutSec + parsed.summary.hermesTimeoutSec,
    );
  });

  it("requires both providers when selecting the new path", () => {
    expect(
      serverConfigSchema.safeParse({ SUMMARY_PROVIDER: "notebooklm" }).success,
    ).toBe(false);
    const parsed = serverConfigSchema.parse(configured);
    expect(parsed.summary.hermesModel).toBe("summary");
    expect(parsed.inference.openAIBaseUrl).toBeUndefined();
  });

  it.each([
    { SUMMARY_PROVIDER: "unknown" },
    { SUMMARY_READER_ENABLED: "yes" },
    { SUMMARY_NOTEBOOKLM_URL: "invalid" },
    { SUMMARY_HERMES_API_KEY: "" },
    { SUMMARY_MAX_ATTEMPTS: "0" },
    { SUMMARY_MAX_ATTEMPTS: "4" },
    { SUMMARY_HERMES_TIMEOUT_SEC: "-1" },
    { SUMMARY_MANUAL_WAIT_SEC: "600" },
    { SUMMARY_JOB_TIMEOUT_SEC: "300" },
    { SUMMARY_MAX_OUTPUT_TOKENS: "8192" },
    { SUMMARY_MAX_SOURCE_CHARS: "0" },
    { SUMMARY_MAX_SOURCE_CHARS: "500001" },
    { SUMMARY_NOTEBOOKLM_TIMEOUT_SEC: "1.5" },
  ])("rejects invalid values or budgets: %o", (env) => {
    expect(serverConfigSchema.safeParse(env).success).toBe(false);
  });

  it("does not expose provider credentials to the client", () => {
    expect(clientConfig).not.toHaveProperty("summary");
    expect(JSON.stringify(clientConfig)).not.toContain(
      configured.SUMMARY_HERMES_API_KEY,
    );
    expect(JSON.stringify(clientConfig)).not.toContain(
      configured.SUMMARY_NOTEBOOKLM_TOKEN,
    );
  });
});

it("enables summary tagging only with the isolated configured pipeline", () => {
  expect(
    serverConfigSchema.safeParse({ SUMMARY_AUTO_TAGS_ENABLED: "true" }).success,
  ).toBe(false);
  expect(
    serverConfigSchema.parse({
      ...configured,
      SUMMARY_AUTO_TAGS_ENABLED: "true",
    }).summary.autoTagsEnabled,
  ).toBe(true);
  expect(
    serverConfigSchema.safeParse({
      ...configured,
      SUMMARY_AUTO_TAGS_ENABLED: "yes",
    }).success,
  ).toBe(false);
});
