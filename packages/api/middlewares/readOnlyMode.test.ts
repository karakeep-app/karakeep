import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { config } = vi.hoisted(() => ({
  config: {
    demoMode: undefined as object | undefined,
    degradedMode: false,
  },
}));

vi.mock("@karakeep/shared/config", () => ({ default: config }));

import { rejectMutationInReadOnlyMode } from "./readOnlyMode";

describe("rejectMutationInReadOnlyMode", () => {
  const handler = vi.fn((c: { text: (body: string) => Response }) =>
    c.text("ok"),
  );
  const app = new Hono().post("/", rejectMutationInReadOnlyMode, handler);

  beforeEach(() => {
    config.demoMode = undefined;
    config.degradedMode = false;
    handler.mockClear();
  });

  it("allows writes in normal mode", async () => {
    const response = await app.request("http://localhost/", { method: "POST" });

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("rejects writes in demo mode", async () => {
    config.demoMode = {};

    const response = await app.request("http://localhost/", { method: "POST" });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(
      "Mutations are not allowed in demo mode",
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects writes in degraded mode", async () => {
    config.degradedMode = true;

    const response = await app.request("http://localhost/", { method: "POST" });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(
      "Karakeep is degraded and in read-only mode",
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
