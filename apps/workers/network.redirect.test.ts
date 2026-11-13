import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// Loopback is allowlisted so the redirect loop can talk to local test servers.
vi.mock("@karakeep/shared/config", () => ({
  default: {
    allowedInternalHostnames: ["127.0.0.1", "localhost"],
    crawler: { ipValidation: { dnsResolverTimeoutSec: 1 } },
    proxy: {
      httpProxy: undefined,
      httpsProxy: undefined,
      noProxy: undefined,
    },
  },
}));

import { fetchWithProxy, resolveValidatedRedirectUrl } from "./network";

interface RecordedRequest {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
) {
  const requests: RecordedRequest[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
      });
      handler(req, res);
    });
  });
  return { server, requests };
}

const credentialHeaders = {
  Authorization: "Bearer webhook-secret",
  "Proxy-Authorization": "Basic cHJveHk6c2VjcmV0",
  Cookie: "session=secret",
  "X-Custom": "kept",
};

describe("redirect credential handling", () => {
  // Same host, different ports => different origins.
  const target = startServer((_req, res) => {
    res.writeHead(200).end("ok");
  });
  let targetOrigin = "";

  const origin = startServer((req, res) => {
    const [path, query] = (req.url ?? "").split("?");
    const status = Number(new URLSearchParams(query).get("status") ?? 307);
    if (path === "/cross") {
      res.writeHead(status, { Location: `${targetOrigin}/landing` }).end();
    } else if (path === "/to-localhost") {
      res
        .writeHead(307, {
          Location: `${originUrl.replace("127.0.0.1", "localhost")}/landing`,
        })
        .end();
    } else if (path === "/same") {
      res.writeHead(status, { Location: "/landing" }).end();
    } else {
      res.writeHead(200).end("ok");
    }
  });
  let originUrl = "";

  beforeAll(async () => {
    await new Promise<void>((r) => target.server.listen(0, "127.0.0.1", r));
    await new Promise<void>((r) => origin.server.listen(0, "127.0.0.1", r));
    targetOrigin = `http://127.0.0.1:${(target.server.address() as AddressInfo).port}`;
    originUrl = `http://127.0.0.1:${(origin.server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((r) => target.server.close(r));
    await new Promise((r) => origin.server.close(r));
  });

  test.each([301, 302, 303, 307, 308])(
    "drops credentials on a cross-origin %i redirect",
    async (status) => {
      target.requests.length = 0;

      const response = await fetchWithProxy(
        `${originUrl}/cross?status=${status}`,
        {
          method: "POST",
          headers: { ...credentialHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ hello: "world" }),
        },
      );

      expect(response.status).toBe(200);
      expect(target.requests).toHaveLength(1);
      const [received] = target.requests;
      expect(received.headers.authorization).toBeUndefined();
      expect(received.headers["proxy-authorization"]).toBeUndefined();
      expect(received.headers.cookie).toBeUndefined();
      expect(received.headers["x-custom"]).toBe("kept");
    },
  );

  test("keeps credentials on a same-origin redirect", async () => {
    origin.requests.length = 0;

    const response = await fetchWithProxy(`${originUrl}/same?status=307`, {
      method: "POST",
      headers: credentialHeaders,
      body: "payload",
    });

    expect(response.status).toBe(200);
    const landing = origin.requests.find((r) => r.url === "/landing");
    expect(landing?.headers.authorization).toBe("Bearer webhook-secret");
    expect(landing?.headers.cookie).toBe("session=secret");
    expect(landing?.body).toBe("payload");
  });

  test("treats a different hostname on the same port as cross-origin", async () => {
    origin.requests.length = 0;

    // 127.0.0.1 -> localhost on the same port reaches the same server but is
    // a different origin, so only the hostname differs between the two hops.
    await fetchWithProxy(`${originUrl}/to-localhost`, {
      headers: credentialHeaders,
    });

    expect(origin.requests.map((r) => r.url)).toEqual([
      "/to-localhost",
      "/landing",
    ]);
    const [first, landing] = origin.requests;
    expect(first.headers.authorization).toBe("Bearer webhook-secret");
    expect(landing.headers.host).toBe(
      new URL(originUrl).host.replace("127.0.0.1", "localhost"),
    );
    expect(landing.headers.authorization).toBeUndefined();
    expect(landing.headers.cookie).toBeUndefined();
  });

  test("resolveValidatedRedirectUrl drops credentials across origins", async () => {
    target.requests.length = 0;

    const resolved = await resolveValidatedRedirectUrl(
      `${originUrl}/cross?status=302`,
      { headers: credentialHeaders },
    );

    expect(resolved.toString()).toBe(`${targetOrigin}/landing`);
    expect(target.requests).toHaveLength(1);
    expect(target.requests[0].headers.authorization).toBeUndefined();
    expect(target.requests[0].headers.cookie).toBeUndefined();
  });
});
