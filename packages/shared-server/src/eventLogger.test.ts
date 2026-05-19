import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

interface LogCall {
  level: string;
  record: Record<string, unknown>;
}

const logCalls: LogCall[] = [];

vi.mock("@karakeep/shared/config", () => ({
  default: {
    eventLogs: {
      enabled: true,
      otlpExport: { enabled: false, endpoint: undefined },
    },
    tracing: { serviceName: "test-svc" },
    serverVersion: "test",
  },
}));

vi.mock("@karakeep/shared/logger", () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("winston", () => ({
  default: {
    createLogger: () => ({
      log: (level: string, record: Record<string, unknown>) => {
        logCalls.push({ level, record });
      },
    }),
    format: {
      combine: () => undefined,
      timestamp: () => undefined,
      json: () => undefined,
    },
    transports: { Console: class {} },
  },
}));

import {
  addLogFields,
  initEventLogger,
  logEvent,
  withEventLog,
} from "./eventLogger";

beforeAll(() => {
  initEventLogger("test");
});

beforeEach(() => {
  logCalls.length = 0;
});

describe("withEventLog", () => {
  it("emits info with name, duration, and seed fields on success", async () => {
    const result = await withEventLog("user.login", async () => "ok", {
      "user.id": "u1",
      "auth.provider": "credentials",
    });
    expect(result).toBe("ok");
    expect(logCalls).toHaveLength(1);
    expect(logCalls[0].level).toBe("info");
    expect(logCalls[0].record["event.name"]).toBe("user.login");
    expect(logCalls[0].record["user.id"]).toBe("u1");
    expect(logCalls[0].record["auth.provider"]).toBe("credentials");
    expect(typeof logCalls[0].record.duration).toBe("number");
  });

  it("merges fields added via addLogFields within the same scope", async () => {
    await withEventLog(
      "inferenceWorker.run",
      async () => {
        addLogFields<"inferenceWorker.run">({ "inference.model": "gpt-4" });
      },
      { "bookmark.id": "b1", "inference.type": "tag" },
    );

    const rec = logCalls[0].record;
    expect(rec["bookmark.id"]).toBe("b1");
    expect(rec["inference.type"]).toBe("tag");
    expect(rec["inference.model"]).toBe("gpt-4");
  });

  it("emits error level with exception fields when fn throws Error", async () => {
    await expect(
      withEventLog(
        "user.login",
        async () => {
          throw new TypeError("boom");
        },
        { "user.id": "u1", "auth.provider": "credentials" },
      ),
    ).rejects.toThrow("boom");

    const rec = logCalls[0].record;
    expect(logCalls[0].level).toBe("error");
    expect(rec["exception.type"]).toBe("TypeError");
    expect(rec["exception.message"]).toBe("boom");
    expect(typeof rec["exception.stacktrace"]).toBe("string");
  });

  it("extracts trpc.error_code when fn throws TRPCError", async () => {
    const { TRPCError } = await import("@trpc/server");
    await expect(
      withEventLog(
        "user.signup",
        async () => {
          throw new TRPCError({ code: "FORBIDDEN", message: "nope" });
        },
        { "auth.provider": "credentials", "user.id": "user123" },
      ),
    ).rejects.toThrow("nope");

    const rec = logCalls[0].record;
    expect(logCalls[0].level).toBe("error");
    expect(rec["exception.type"]).toBe("TRPCError");
    expect(rec["exception.message"]).toBe("nope");
    expect(rec["trpc.error_code"]).toBe("FORBIDDEN");
  });

  it("uses typeof for non-Error throws", async () => {
    await expect(
      withEventLog(
        "user.login",
        async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw "stringy";
        },
        { "user.id": "u1", "auth.provider": "credentials" },
      ),
    ).rejects.toBe("stringy");

    const rec = logCalls[0].record;
    expect(rec["exception.type"]).toBe("string");
    expect(rec["exception.message"]).toBe("stringy");
    expect(rec["exception.stacktrace"]).toBeUndefined();
  });
});

describe("logEvent", () => {
  it("accepts (name, fields) overload", () => {
    logEvent("bookmark.archive", {
      "bookmark.id": "b1",
      "bookmark.archived": true,
    });
    expect(logCalls).toHaveLength(1);
    expect(logCalls[0].record["event.name"]).toBe("bookmark.archive");
    expect(logCalls[0].record["bookmark.id"]).toBe("b1");
    expect(logCalls[0].record["bookmark.archived"]).toBe(true);
  });

  it("accepts single-object form", () => {
    logEvent({ "event.name": "user.password_change" });
    expect(logCalls[0].record["event.name"]).toBe("user.password_change");
  });
});

describe("addLogFields", () => {
  it("is a no-op when called outside any withEventLog scope", () => {
    expect(() => addLogFields({ "user.id": "u1" })).not.toThrow();
    expect(logCalls).toHaveLength(0);
  });
});
