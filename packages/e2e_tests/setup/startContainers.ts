import { execSync } from "child_process";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import type { GlobalSetupContext } from "vitest/node";

import { waitUntil } from "../utils/general";

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

async function waitForHealthy(port: number, timeout = 60000): Promise<void> {
  return waitUntil(
    async () => {
      const response = await fetch(`http://localhost:${port}/api/health`);
      return response.status === 200;
    },
    "Container are healthy",
    timeout,
  );
}

export default async function ({ provide }: GlobalSetupContext) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const port = await getRandomPort();

  const buildArg = process.env.E2E_TEST_NO_BUILD ? "" : "--build";

  console.log(`Starting docker compose on port ${port}...`);
  execSync(`docker compose up ${buildArg} -d`, {
    cwd: __dirname,
    stdio: "inherit",
    env: {
      ...process.env,
      KARAKEEP_PORT: port.toString(),
    },
  });

  console.log("Waiting for service to become healthy...");
  await waitForHealthy(port);

  // Wait 5 seconds for the worker to start
  await new Promise((resolve) => setTimeout(resolve, 5000));

  provide("karakeepPort", port);

  process.env.KARAKEEP_PORT = port.toString();

  return async () => {
    console.log("Stopping docker compose...");
    execSync("docker compose down", {
      cwd: __dirname,
      stdio: "inherit",
    });
    return Promise.resolve();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    karakeepPort: number;
  }
}
