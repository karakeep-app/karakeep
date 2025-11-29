/**
 * Sandboxed execution utility for running external binaries with restricted permissions.
 *
 * This module provides a secure wrapper around `execa` that uses bubblewrap to sandbox
 * external binary execution, preventing them from accessing sensitive files or resources.
 *
 * ## Security Benefits
 *
 * When bubblewrap is available, external binaries (like yt-dlp and monolith) run with:
 * - Read-only access to system binaries and libraries
 * - Read-write access only to explicitly whitelisted paths
 * - Isolated temporary filesystem (/tmp)
 * - Optional network isolation
 * - Separate user, IPC, PID, and UTS namespaces
 *
 * This prevents malicious or compromised binaries from:
 * - Reading sensitive configuration files, environment variables, or other user data
 * - Writing to unauthorized locations on the filesystem
 * - Accessing other processes or shared memory
 *
 * ## Installation
 *
 * On Ubuntu/Debian:
 * ```bash
 * sudo apt-get install bubblewrap
 * ```
 *
 * On Fedora/RHEL:
 * ```bash
 * sudo dnf install bubblewrap
 * ```
 *
 * On macOS:
 * ```bash
 * # Bubblewrap is not available on macOS. The code will fall back to unsandboxed execution.
 * ```
 *
 * ## Fallback Behavior
 *
 * If bubblewrap is not installed, the function falls back to regular execa execution
 * (unless `enforceSandbox: true` is set in the config).
 *
 * @module sandboxExeca
 */
import { execa, type Options as ExecaOptions, type ResultPromise } from "execa";
import logger from "@karakeep/shared/logger";

let bubblewrapAvailable: boolean | null = null;

/**
 * Checks if bubblewrap is available on the system
 */
async function checkBubblewrapAvailability(): Promise<boolean> {
  if (bubblewrapAvailable !== null) {
    return bubblewrapAvailable;
  }

  try {
    await execa("which", ["bwrap"]);
    bubblewrapAvailable = true;
    logger.info("[SandboxExeca] bubblewrap (bwrap) is available");
  } catch {
    bubblewrapAvailable = false;
    logger.warn(
      "[SandboxExeca] bubblewrap (bwrap) is not available. External binaries will run without sandboxing. Install bubblewrap for enhanced security.",
    );
  }

  return bubblewrapAvailable;
}

export interface SandboxConfig {
  /**
   * Paths to mount as read-only in the sandbox
   * @default ["/usr", "/lib", "/lib64", "/bin"]
   */
  readOnlyPaths?: string[];

  /**
   * Paths to mount as read-write in the sandbox
   */
  readWritePaths?: string[];

  /**
   * Whether to allow network access
   * @default false
   */
  allowNetwork?: boolean;

  /**
   * Whether to enable sandboxing even if bubblewrap is not available
   * If false and bubblewrap is unavailable, falls back to regular execa
   * @default false
   */
  enforceSandbox?: boolean;
}

const DEFAULT_READONLY_PATHS = ["/usr", "/lib", "/lib64", "/bin"];

/**
 * Executes a command in a sandbox using bubblewrap if available.
 * Falls back to regular execa if bubblewrap is not available (unless enforceSandbox is true).
 *
 * @param command - The command to execute
 * @param args - Arguments to pass to the command
 * @param options - Execa options
 * @param sandboxConfig - Sandbox configuration
 * @returns ResultPromise from execa
 *
 * @example
 * ```typescript
 * await sandboxExeca("yt-dlp", ["https://example.com/video"], {
 *   cancelSignal: abortSignal
 * }, {
 *   readWritePaths: ["/tmp/downloads"]
 * });
 * ```
 */
export async function sandboxExeca(
  command: string,
  args: string[],
  options: ExecaOptions = {},
  sandboxConfig: SandboxConfig = {},
): Promise<ResultPromise> {
  const isBubblewrapAvailable = await checkBubblewrapAvailability();

  if (!isBubblewrapAvailable) {
    if (sandboxConfig.enforceSandbox) {
      throw new Error(
        "Sandboxing is enforced but bubblewrap is not available. Please install bubblewrap.",
      );
    }

    logger.debug(
      `[SandboxExeca] Running ${command} without sandbox (bubblewrap not available)`,
    );
    return execa(command, args, options);
  }

  // Build bubblewrap arguments
  const bwrapArgs: string[] = [];

  // Mount read-only paths
  const readOnlyPaths =
    sandboxConfig.readOnlyPaths || DEFAULT_READONLY_PATHS;
  for (const path of readOnlyPaths) {
    bwrapArgs.push("--ro-bind", path, path);
  }

  // Mount read-write paths
  if (sandboxConfig.readWritePaths) {
    for (const path of sandboxConfig.readWritePaths) {
      bwrapArgs.push("--bind", path, path);
    }
  }

  // Add /tmp as tmpfs (isolated temporary filesystem)
  bwrapArgs.push("--tmpfs", "/tmp");

  // Add /proc and /dev
  bwrapArgs.push("--proc", "/proc");
  bwrapArgs.push("--dev", "/dev");

  // Network isolation (unless explicitly allowed)
  if (!sandboxConfig.allowNetwork) {
    bwrapArgs.push("--unshare-net");
  }

  // Unshare user, IPC, PID, and UTS namespaces
  bwrapArgs.push("--unshare-user");
  bwrapArgs.push("--unshare-ipc");
  bwrapArgs.push("--unshare-pid");
  bwrapArgs.push("--unshare-uts");

  // Die with parent
  bwrapArgs.push("--die-with-parent");

  // Start a new session
  bwrapArgs.push("--new-session");

  // Add the actual command and its arguments
  bwrapArgs.push(command, ...args);

  logger.debug(
    `[SandboxExeca] Running ${command} in bubblewrap sandbox with config:`,
    {
      readOnlyPaths,
      readWritePaths: sandboxConfig.readWritePaths || [],
      allowNetwork: sandboxConfig.allowNetwork || false,
    },
  );

  return execa("bwrap", bwrapArgs, options);
}
