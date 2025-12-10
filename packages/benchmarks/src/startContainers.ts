import { execSync } from "child_process";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

import { logInfo, logStep, logSuccess, logWarn } from "./log";
import { sleep, waitUntil } from "./utils";

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

async function waitForHealthy(port: number): Promise<void> {
  await waitUntil(
    async () => {
      const res = await fetch(`http://localhost:${port}/api/health`);
      return res.status === 200;
    },
    "Karakeep stack to become healthy",
    60_000,
    1_000,
  );
}

async function captureDockerLogs(composeDir: string): Promise<void> {
  const logsDir = path.join(composeDir, "setup", "docker-logs");
  try {
    execSync(`mkdir -p "${logsDir}"`, { cwd: composeDir });
  } catch {
    // ignore
  }

  const services = ["web", "meilisearch", "chrome", "nginx", "minio"];
  for (const service of services) {
    try {
      execSync(
        `/bin/sh -c 'docker compose logs ${service} > "${logsDir}/${service}.log" 2>&1'`,
        {
          cwd: composeDir,
          stdio: "ignore",
        },
      );
      logInfo(`Captured logs for ${service}`);
    } catch (error) {
      logWarn(`Failed to capture logs for ${service}: ${error}`);
    }
  }
}

export interface RunningContainers {
  port: number;
  stop: () => Promise<void>;
}

export async function startContainers(): Promise<RunningContainers> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const composeDir = path.join(__dirname, "..");
  const port = await getRandomPort();
  const skipBuild =
    process.env.BENCH_NO_BUILD === "1" || process.env.BENCH_SKIP_BUILD === "1";
  const buildArg = skipBuild ? "" : "--build";

  logStep(`Starting docker compose on port ${port}`);
  execSync(`docker compose up ${buildArg} -d`, {
    cwd: composeDir,
    stdio: "inherit",
    env: { ...process.env, KARAKEEP_PORT: String(port) },
  });

  logInfo("Waiting for services to report healthy...");
  await waitForHealthy(port);
  await sleep(5_000);
  logSuccess("Containers are ready");

  process.env.KARAKEEP_PORT = String(port);

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    logStep("Collecting docker logs");
    await captureDockerLogs(composeDir);
    logStep("Stopping docker compose");
    execSync("docker compose down", { cwd: composeDir, stdio: "inherit" });
  };

  return { port, stop };
}
