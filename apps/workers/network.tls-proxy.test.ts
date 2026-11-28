import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@karakeep/shared/config", () => ({
  default: {
    allowedInternalHostnames: ["localhost"],
    crawler: { ipValidation: { dnsResolverTimeoutSec: 1 } },
    proxy: {
      httpProxy: undefined,
      httpsProxy: undefined,
      noProxy: undefined,
    },
  },
}));

import { fetchWithProxy, resolveValidatedRedirectUrl } from "./network";

// Self-signed certificate for localhost, generated only for this test with:
//   openssl req -x509 -newkey rsa:2048 -nodes -days 36500 -subj "/CN=localhost" \
//     -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
// It is not trusted by anything, which is the point of the test.
const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDVtTyeNHu4Oxpx
7Nd5ltufLYJt89JZ/dkZEOjIvqbUei7QJMHzn5N/yjomoWODyNh4rA0m5s2ZXcxl
5HV7Nw+p2P13WpO3eLD5uWkCJCM7pMX4oM3CD9WcpfxQOJKXt5piXQruqciygO1+
UlCeey7gtfG9HHEoRcX6YJoNmJyXx72OjwZa4eA3nCFB/+d+GyHmTnuImZpeX4vD
mVkhgyyTl3i9LS/1GaeAnCFBjaBX0qZMfLWFuBImIHaufMM4Kg0GNbKxAK4OpByo
AvvsOo/17thLcEkASID5fAtLqDseYf1x4qb/Seg04thJMpMU+2Ee00Fl0AfTAVmY
RkyzjrDpAgMBAAECggEAIXrviHyB7nKp+bOobUbWWOl1D9s9NvaHOr9UrNB7i/mp
WFgN36g+ICzTL+akU8rVKRCRTekmSDLy+PqR8jAF3u7dBMQWtM1ucm0a96goMemm
T0WH/rFi3pP9g6bdRnIP+H2JnyrPw7Fho6LrOOzlAvTWLrGkQ7IsqkVUlTE1xSxP
JzYA55g8zKJLmEQk6ExKCZpDkaFSuJXmdU9ma07Xcfk6epA6DFNwJieybA7jdCYE
KzwAQxBF1rMrX77zuJPlssLyT1lNG4CAjc577tt4d7/VZwcM8tg9qJzNSFs6Rvt2
6DHGfr8D6I0CEdy1b+6d68ouD1LIvlPwZ7MU21NyhQKBgQDutQIYxQMsutQriZdf
Fq/NnRJmChFWyudF7n+ZyOv3fr/MhMk4uMNgpQKWzgL+1dKr989eFGwjQk5ILi3e
EYl9xeUoFZFfKw2FYeqgjo94Zo0yMgzHsifCcTul97F2fDSGd8UDQDulzJqWBazu
BmIpDerGQXpErRcXWGXB0+249QKBgQDlMJo4lvHb6hAbG1hnFOPkzd/LRPnEAVyh
+2CUBl8mczF8JBOwaQy0VtHIcUb8ULNa5hX+kjoTriHnt3jT/uxzYkh5PvjJgulZ
vHEW+6tFW5MDf3MTpk0QUXkqhjYSQMF8cixIjqP50ugnwzTgkFusiI/rouCNxMNG
hBVc7euvpQKBgF+hFlD0BFyUEFHM0l6eyRlXVrqYR+/8Y4Cplmb2jknddlspyy81
HdiG4q2lpJ+Q69BG+8VV6yiI9LGIBooTfoBrmm1fjpiQt976pjNiSWnTs7crQ+Fw
pusHz/yiaW7tPWGtc7jkr8CxYjC931SQLB0EXUzFiIUgzsJkgIeRLohNAoGBAOJN
Hkp4SPIzaJnLY3vNNcUrvylPvytZiOTseI1QyU0G+zqvyL0szP2YqGW57DShXqeH
fvox2qSqERJiqCzzjvfTeOo3UqJu4AjaN/RQpenDJSOUCcXCNF/DgteJVASr6iD9
/1nZdnHsXY09g42lHM/8u9cYqY9yVLrhGtL6nfh9AoGAHRcDT5jbPXsG0MHUp9sz
LRBHGQx0nUMrrjxYf+Mh3GbqFelMwQQt7xSqE8r9UAmpxcpBkjFZwDsfgquAQyYb
r32OBAfMNDQKvTkHxTveDBygwK41SgY8PJQNW226W/DS9WVSjSxDffY0/drf8Ldj
WX/qVkhM/SK7dCdZVtllpsA=
-----END PRIVATE KEY-----
`;

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDJzCCAg+gAwIBAgIUKpCdDB3Wt5erHlkjicjChiM0JYowDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTEyMTIxNTQzNloYDzIxMjYx
MDI4MjE1NDM2WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQDVtTyeNHu4Oxpx7Nd5ltufLYJt89JZ/dkZEOjIvqbU
ei7QJMHzn5N/yjomoWODyNh4rA0m5s2ZXcxl5HV7Nw+p2P13WpO3eLD5uWkCJCM7
pMX4oM3CD9WcpfxQOJKXt5piXQruqciygO1+UlCeey7gtfG9HHEoRcX6YJoNmJyX
x72OjwZa4eA3nCFB/+d+GyHmTnuImZpeX4vDmVkhgyyTl3i9LS/1GaeAnCFBjaBX
0qZMfLWFuBImIHaufMM4Kg0GNbKxAK4OpByoAvvsOo/17thLcEkASID5fAtLqDse
Yf1x4qb/Seg04thJMpMU+2Ee00Fl0AfTAVmYRkyzjrDpAgMBAAGjbzBtMB0GA1Ud
DgQWBBQsGrftAEHMFTsdvgGLhL3rnocdCjAfBgNVHSMEGDAWgBQsGrftAEHMFTsd
vgGLhL3rnocdCjAPBgNVHRMBAf8EBTADAQH/MBoGA1UdEQQTMBGCCWxvY2FsaG9z
dIcEfwAAATANBgkqhkiG9w0BAQsFAAOCAQEAG97G1z6oTGAOUjxuLAXCkqCVIUgO
JuEK2rwT3+xMysOw7CNWSTZLXDDbFyU2DKENOUMpTq/XN7TzOb6qx5XR5VSwxS6M
O3HQH5p9VG+0mPgZtwKgpgYiEGDI3ThBBlA+tFXCOcfaWPnmG0MRno/KtDuaKah5
SBIPYuhjvDgnFEktuQEH59t7v1b5RD2eXJyycgminE/RK0xUfhoW0yR0B3a/T7b4
084WMY5aN8gS0EFUa66DrV134ChMGOojSP8BSbOPI63QdxYvos0c/BZxMxQnMRQW
2KjNGzTL7ZEQJTKp1A0ky1wnJRiFbiU96dQ9lrwyq+h40NH2/4nPXdHXrA==
-----END CERTIFICATE-----
`;

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as AddressInfo).port),
    );
  });
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("ignoreHttpsErrors against a self-signed server", () => {
  let target: https.Server;
  let proxy: http.Server;
  let url: string;
  let runProxy: {
    httpProxy: string | undefined;
    httpsProxy: string | undefined;
    noProxy: string[] | undefined;
  };
  const proxiedConnections: string[] = [];
  // CONNECT sockets leave the HTTP server, so close() would wait for them.
  const tunnelSockets = new Set<net.Socket>();

  beforeAll(async () => {
    target = https.createServer({ key: TEST_KEY, cert: TEST_CERT }, (_, res) =>
      res.end("secure ok"),
    );
    const targetPort = await listen(target);
    url = `https://localhost:${targetPort}/`;

    // Minimal CONNECT proxy: tunnels the TLS connection to the target as is.
    proxy = http.createServer((_, res) => res.writeHead(405).end());
    proxy.on("connect", (req, clientSocket: net.Socket, head) => {
      proxiedConnections.push(req.url ?? "");
      tunnelSockets.add(clientSocket);
      const upstream = net.connect(targetPort, "127.0.0.1", () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      tunnelSockets.add(upstream);
      upstream.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => upstream.destroy());
    });
    const proxyPort = await listen(proxy);
    runProxy = {
      httpProxy: undefined,
      httpsProxy: `http://127.0.0.1:${proxyPort}`,
      noProxy: undefined,
    };
  });

  afterAll(async () => {
    for (const socket of tunnelSockets) socket.destroy();
    proxy.closeAllConnections();
    target.closeAllConnections();
    await Promise.all([close(proxy), close(target)]);
  });

  test("direct: rejects the certificate by default", async () => {
    await expect(fetchWithProxy(url)).rejects.toThrow(/certificate/i);
  });

  test("direct: accepts the certificate when enabled", async () => {
    const response = await fetchWithProxy(url, { ignoreHttpsErrors: true });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("secure ok");
  });

  test("proxy: rejects the target certificate by default", async () => {
    const before = proxiedConnections.length;
    await expect(fetchWithProxy(url, {}, runProxy)).rejects.toThrow(
      /certificate/i,
    );
    expect(proxiedConnections.length).toBe(before + 1);
  });

  test("proxy: accepts the target certificate when enabled", async () => {
    const before = proxiedConnections.length;
    const response = await fetchWithProxy(
      url,
      { ignoreHttpsErrors: true },
      runProxy,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("secure ok");
    expect(proxiedConnections.length).toBe(before + 1);
  });

  test("redirect resolution follows the same setting", async () => {
    await expect(
      resolveValidatedRedirectUrl(url, {}, runProxy),
    ).rejects.toThrow(/certificate/i);
    const resolved = await resolveValidatedRedirectUrl(
      url,
      { ignoreHttpsErrors: true },
      runProxy,
    );
    expect(resolved.toString()).toBe(url);
  });
});
