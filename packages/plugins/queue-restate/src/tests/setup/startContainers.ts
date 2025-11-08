import { execSync } from "child_process";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import type { GlobalSetupContext } from "vitest/node";

import { waitUntil } from "../utils.js";

async function getRandomPort(): Promise<number> {
  const server = net.createServer();
  return new Promise<number>((resolve, reject) => {
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealthy(
  ingressPort: number,
  adminPort: number,
  timeout = 60000,
): Promise<void> {
  await waitUntil(
    async () => {
      const response = await fetch(`http://localhost:${adminPort}/health`);
      return response.ok;
    },
    "Restate admin API is healthy",
    timeout,
  );

  await waitUntil(
    async () => {
      const response = await fetch(
        `http://localhost:${ingressPort}/restate/health`,
      );
      return response.ok;
    },
    "Restate ingress is healthy",
    timeout,
  );
}

export default async function ({ provide }: GlobalSetupContext) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const ingressPort = await getRandomPort();
  const adminPort = await getRandomPort();

  console.log(
    `Starting Restate on ports ${ingressPort} (ingress) and ${adminPort} (admin)...`,
  );
  execSync(`docker compose up -d`, {
    cwd: path.join(__dirname, ".."),
    stdio: "ignore",
    env: {
      ...process.env,
      RESTATE_INGRESS_PORT: ingressPort.toString(),
      RESTATE_ADMIN_PORT: adminPort.toString(),
    },
  });

  console.log("Waiting for Restate to become healthy...");
  await waitForHealthy(ingressPort, adminPort);

  provide("restateIngressPort", ingressPort);
  provide("restateAdminPort", adminPort);

  process.env.RESTATE_INGRESS_ADDR = `http://localhost:${ingressPort}`;
  process.env.RESTATE_ADMIN_ADDR = `http://localhost:${adminPort}`;
  process.env.RESTATE_LISTEN_PORT = "9080";

  return async () => {
    console.log("Stopping Restate...");
    execSync("docker compose down", {
      cwd: path.join(__dirname, ".."),
      stdio: "ignore",
    });
    return Promise.resolve();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    restateIngressPort: number;
    restateAdminPort: number;
  }
}
