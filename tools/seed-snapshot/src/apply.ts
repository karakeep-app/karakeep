import { execFileSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SNAPSHOT_PATTERN = /^seed-data-\d{4}-\d{2}-\d{2}-\d{6}\.tar\.gz$/;

function logStep(title: string): void {
  console.log(`\n== ${title}`);
}

function logInfo(message: string): void {
  console.log(`  -- ${message}`);
}

function logSuccess(message: string): void {
  console.log(`  OK ${message}`);
}

function hasForceFlag(): boolean {
  return process.argv.slice(2).includes("--force");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

async function findLatestSnapshot(snapshotsDir: string): Promise<string> {
  const entries = await fs.readdir(snapshotsDir);
  const snapshots = entries
    .filter((entry) => SNAPSHOT_PATTERN.test(entry))
    .sort();

  const latest = snapshots.at(-1);
  if (!latest) {
    throw new Error(`No seed snapshots found in ${snapshotsDir}`);
  }

  return path.join(snapshotsDir, latest);
}

async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.join(__dirname, "..", "..", "..");
  const snapshotsDir = path.join(repoRoot, "snapshots");
  const dataDir = path.join(repoRoot, "data");
  const force = hasForceFlag();

  logStep("Finding latest seed snapshot");
  const snapshotPath = await findLatestSnapshot(snapshotsDir);
  logInfo(`Using ${path.relative(repoRoot, snapshotPath)}`);

  if (await pathExists(dataDir)) {
    if (!force) {
      throw new Error(
        `Refusing to overwrite existing data dir at ${dataDir}. Re-run with --force to replace it.`,
      );
    }

    logStep("Removing existing data dir");
    await fs.rm(dataDir, { force: true, recursive: true });
  }

  logStep("Applying seed snapshot");
  await fs.mkdir(dataDir, { recursive: true });
  execFileSync("tar", ["-xzf", snapshotPath, "-C", dataDir], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  logSuccess(`Applied snapshot to ${dataDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
