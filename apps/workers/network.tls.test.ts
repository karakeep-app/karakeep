import https from "node:https";
import { Response } from "node-fetch";
import { beforeEach, describe, expect, test, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("node-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node-fetch")>();
  return { ...actual, default: fetchMock };
});

vi.mock("@karakeep/shared/config", () => ({
  default: {
    allowedInternalHostnames: undefined,
    crawler: { ipValidation: { dnsResolverTimeoutSec: 1 } },
    proxy: {
      httpProxy: undefined,
      httpsProxy: undefined,
      noProxy: undefined,
    },
  },
}));

import { fetchWithProxy, getProxyAgent } from "./network";

// A public IP literal skips DNS resolution, so no pinned lookup is involved.
const url = "https://93.184.216.34/page";

function lastAgent() {
  const init = fetchMock.mock.lastCall?.[1] as { agent?: unknown };
  return init.agent;
}

describe("ignoreHttpsErrors", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
  });

  test("verifies certificates by default", async () => {
    await fetchWithProxy(url);
    expect(lastAgent()).toBeUndefined();
  });

  test("disables certificate verification when enabled", async () => {
    await fetchWithProxy(url, { ignoreHttpsErrors: true });
    const agent = lastAgent();
    expect(agent).toBeInstanceOf(https.Agent);
    expect((agent as https.Agent).options.rejectUnauthorized).toBe(false);
  });

  test("is not forwarded to node-fetch as a request option", async () => {
    await fetchWithProxy(url, { ignoreHttpsErrors: true });
    expect(fetchMock.mock.lastCall?.[1]).not.toHaveProperty(
      "ignoreHttpsErrors",
    );
  });

  test("applies to the https proxy agent", () => {
    const runProxy = {
      httpProxy: undefined,
      httpsProxy: "http://proxy.example:3128",
      noProxy: undefined,
    };
    const strict = getProxyAgent(url, runProxy) as https.Agent;
    expect(strict.options.rejectUnauthorized).toBeUndefined();

    const lenient = getProxyAgent(url, runProxy, {
      ignoreHttpsErrors: true,
    }) as https.Agent;
    expect(lenient.options.rejectUnauthorized).toBe(false);
  });
});
