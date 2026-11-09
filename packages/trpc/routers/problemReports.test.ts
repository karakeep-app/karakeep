import { beforeEach, describe, expect, test, vi } from "vitest";

import serverConfig from "@karakeep/shared/config";

import type { CustomTestContext } from "../testUtils";
import { buildProblemReportEmail, sendProblemReportEmail } from "../email";
import { createTestUser, defaultBeforeEach, getApiCaller } from "../testUtils";

vi.mock("@karakeep/shared/config", async (original) => {
  const mod = (await original()) as typeof import("@karakeep/shared/config");
  return {
    ...mod,
    default: {
      ...mod.default,
      email: {
        smtp: {
          host: "test-smtp.example.com",
          port: 587,
          secure: false,
          from: "karakeep@example.com",
        },
      },
      problemReports: {
        enabled: true,
        email: "support@example.com",
      },
    },
  };
});

vi.mock("../email", async (original) => {
  const mod = (await original()) as typeof import("../email");
  return {
    ...mod,
    sendProblemReportEmail: vi.fn().mockResolvedValue(undefined),
  };
});

beforeEach<CustomTestContext>(defaultBeforeEach(false));

describe("Problem reports router", () => {
  beforeEach(() => {
    vi.mocked(sendProblemReportEmail).mockClear();
    (
      serverConfig.problemReports as { enabled: boolean; email?: string }
    ).enabled = true;
  });

  test<CustomTestContext>("sends a report with server and client diagnostics", async ({
    db,
  }) => {
    const user = await createTestUser(db, {
      name: "Reporter",
      email: "reporter@test.com",
      password: "pass1234",
    });
    const caller = getApiCaller(db, user.id, user.email);

    const res = await caller.problemReports.submit({
      category: "bug",
      description: "Clicking save does nothing on the bookmark page.",
      diagnostics: {
        pageUrl: "https://karakeep.test/dashboard/bookmarks",
        userAgent: "Mozilla/5.0",
        recentErrors: [
          {
            message: "TypeError: x is undefined",
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });

    expect(res.reportId).toBeDefined();
    expect(sendProblemReportEmail).toHaveBeenCalledOnce();
    const report = vi.mocked(sendProblemReportEmail).mock.calls[0][0];
    expect(report.reportId).toBe(res.reportId);
    expect(report.reporter).toMatchObject({
      id: user.id,
      email: "reporter@test.com",
    });
    expect(report.diagnostics?.recentErrors).toHaveLength(1);
  });

  test<CustomTestContext>("rejects when problem reports are disabled", async ({
    db,
  }) => {
    (
      serverConfig.problemReports as { enabled: boolean; email?: string }
    ).enabled = false;
    const user = await createTestUser(db, {
      name: "Reporter",
      email: "reporter@test.com",
      password: "pass1234",
    });
    const caller = getApiCaller(db, user.id, user.email);

    await expect(
      caller.problemReports.submit({
        category: "other",
        description: "This should not be sent at all.",
      }),
    ).rejects.toThrow(/not enabled/);
    expect(sendProblemReportEmail).not.toHaveBeenCalled();
  });

  test<CustomTestContext>("rejects API key auth", async ({ db }) => {
    const user = await createTestUser(db, {
      name: "Reporter",
      email: "reporter@test.com",
      password: "pass1234",
    });
    const caller = getApiCaller(db, user.id, user.email, "user", {
      type: "apiKey",
      keyId: "key",
      scopes: [],
    });

    await expect(
      caller.problemReports.submit({
        category: "bug",
        description: "Sent from a script using an API key.",
      }),
    ).rejects.toThrow();
    expect(sendProblemReportEmail).not.toHaveBeenCalled();
  });

  test<CustomTestContext>("rejects too short descriptions", async ({ db }) => {
    const user = await createTestUser(db, {
      name: "Reporter",
      email: "reporter@test.com",
      password: "pass1234",
    });
    const caller = getApiCaller(db, user.id, user.email);

    await expect(
      caller.problemReports.submit({ category: "bug", description: "short" }),
    ).rejects.toThrow();
  });
});

describe("buildProblemReportEmail", () => {
  test("escapes user content in the html body", () => {
    const { subject, html, text } = buildProblemReportEmail({
      reportId: "r1",
      category: "bug",
      description: "<script>alert(1)</script>\nsecond line",
      reporter: { id: "u1", email: "a@b.com" },
      server: { publicUrl: "https://k.test", receivedAt: "now" },
      diagnostics: {
        recentErrors: [{ message: "<img src=x>", timestamp: "t" }],
      },
    });
    expect(subject).toBe(
      "[Karakeep problem report] Something isn't working: <script>alert(1)</script>",
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x>");
    expect(text).toContain("second line");
  });
});
