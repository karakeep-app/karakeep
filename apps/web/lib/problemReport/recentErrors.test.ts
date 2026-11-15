// @vitest-environment jsdom
import { beforeAll, describe, expect, test, vi } from "vitest";

import {
  getRecentErrors,
  installRecentErrorCapture,
  setRecentErrorsOwner,
} from "./recentErrors";

describe("recentErrors", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installRecentErrorCapture();
  });

  test("keeps errors captured before the owner is known", () => {
    console.error("early error");
    setRecentErrorsOwner("user-a");
    expect(getRecentErrors().map((e) => e.message)).toEqual(["early error"]);
  });

  test("drops errors captured under a different account", () => {
    console.error("user a error");
    setRecentErrorsOwner("user-a");
    expect(getRecentErrors().length).toBeGreaterThan(0);

    setRecentErrorsOwner("user-b");
    expect(getRecentErrors()).toEqual([]);

    console.error("user b error");
    setRecentErrorsOwner("user-b");
    expect(getRecentErrors().map((e) => e.message)).toEqual(["user b error"]);
  });

  test("records rejections with no reason", () => {
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), { reason: undefined }),
    );
    expect(getRecentErrors().at(-1)).toMatchObject({
      message: "undefined",
      source: "unhandledrejection",
    });
  });
});
