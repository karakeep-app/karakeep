import { execFileSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Release snapshots are named seed-data-v<version>.tar.gz, local builds
// seed-data-<timestamp>.tar.gz.
const SNAPSHOT_PATTERN =
  /^seed-data-(?:v\d+\.\d+\.\d+|\d{4}-\d{2}-\d{2}-\d{6})\.tar\.gz$/;

function logStep(title: string): void {
  console.log(`\n== ${title}`);
}

function logInfo(message: string): void {
  console.log(`  -- ${message}`);
}

function logSuccess(message: string): void {
  console.log(`  OK ${message}`);
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

function parseArgs(): { force: boolean; snapshot: string | null } {
  const args = process.argv.slice(2);
  let snapshot: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--snapshot") {
      snapshot = args[++i] ?? null;
    } else if (args[i].startsWith("--snapshot=")) {
      snapshot = args[i].slice("--snapshot=".length);
    }
  }
  return { force: args.includes("--force"), snapshot };
}

interface SnapshotInfo {
  archivePath: string;
  // [major, minor, patch]; local builds of the working tree sort above every
  // release.
  version: number[];
  createdAt: string;
}

async function readSnapshotInfo(
  snapshotsDir: string,
  archive: string,
): Promise<SnapshotInfo> {
  const manifestPath = path.join(
    snapshotsDir,
    archive.replace(/\.tar\.gz$/, ".json"),
  );
  let karakeepVersion = "dev";
  let createdAt = "";
  if (await pathExists(manifestPath)) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
      karakeepVersion?: string;
      createdAt?: string;
    };
    karakeepVersion = manifest.karakeepVersion ?? "dev";
    createdAt = manifest.createdAt ?? "";
  }
  const version =
    karakeepVersion === "dev"
      ? [Infinity, Infinity, Infinity]
      : karakeepVersion.split(".").map(Number);
  return { archivePath: path.join(snapshotsDir, archive), version, createdAt };
}

function compareSnapshots(a: SnapshotInfo, b: SnapshotInfo): number {
  for (let i = 0; i < 3; i++) {
    if (a.version[i] !== b.version[i]) {
      return a.version[i] < b.version[i] ? -1 : 1;
    }
  }
  return a.createdAt.localeCompare(b.createdAt);
}

// Picks the snapshot from the newest Karakeep version, so the dev env starts
// from data that needs the fewest migrations.
async function findLatestSnapshot(snapshotsDir: string): Promise<string> {
  const entries = await fs.readdir(snapshotsDir);
  const snapshots = await Promise.all(
    entries
      .filter((entry) => SNAPSHOT_PATTERN.test(entry))
      .map((entry) => readSnapshotInfo(snapshotsDir, entry)),
  );

  const latest = snapshots.sort(compareSnapshots).at(-1);
  if (!latest) {
    throw new Error(`No seed snapshots found in ${snapshotsDir}`);
  }

  return latest.archivePath;
}

async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.join(__dirname, "..", "..", "..");
  const snapshotsDir = path.join(repoRoot, "snapshots");
  const dataDir = path.join(repoRoot, "data");
  const { force, snapshot } = parseArgs();

  logStep("Finding seed snapshot");
  const snapshotPath = snapshot
    ? path.resolve(snapshotsDir, snapshot)
    : await findLatestSnapshot(snapshotsDir);
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
