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

async function waitForHealthy(port: number, timeout = 30000): Promise<void> {
  await waitUntil(
    async () => {
      const socket = net.createConnection({ port, host: "localhost" });
      return new Promise<boolean>((resolve) => {
        socket.on("connect", () => {
          socket.destroy();
          resolve(true);
        });
        socket.on("error", () => {
          socket.destroy();
          resolve(false);
        });
      });
    },
    "Redis is healthy",
    timeout,
  );
}

export default async function ({ provide }: GlobalSetupContext) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const redisPort = await getRandomPort();

  console.log(`Starting Redis on port ${redisPort}...`);
  try {
    execSync(`docker compose up -d`, {
      cwd: path.join(__dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        REDIS_PORT: redisPort.toString(),
      },
    });
  } catch (error) {
    const execError = error as {
      stdout?: Buffer;
      stderr?: Buffer;
      message?: string;
    };
    console.error("Failed to start Redis container");
    if (execError.stdout) {
      console.error(execError.stdout.toString());
    }
    if (execError.stderr) {
      console.error(execError.stderr.toString());
    }
    console.error(execError.message ?? error);
    throw error;
  }

  console.log("Waiting for Redis to become healthy...");
  await waitForHealthy(redisPort);

  provide("redisPort", redisPort);

  return async () => {
    console.log("Stopping Redis...");
    execSync("docker compose down", {
      cwd: path.join(__dirname, ".."),
      stdio: "ignore",
    });
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    redisPort: number;
  }
}
