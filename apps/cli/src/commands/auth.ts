import fsp from "node:fs/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import {
  DEFAULT_SERVER_ADDR,
  getConfigPath,
  loadConfigFile,
  normalizeConfig,
} from "@/lib/config";
import { printStatusMessage } from "@/lib/output";
import { Command } from "@commander-js/extra-typings";

async function pathExists(filePath: string) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadExistingConfig(opts: AuthInitOptions) {
  try {
    return loadConfigFile();
  } catch (error) {
    if (opts.force) {
      return {};
    }
    throw error;
  }
}

async function promptForValue(
  rl: readline.Interface,
  prompt: string,
  existing?: string,
) {
  if (!input.isTTY) {
    return existing;
  }

  const suffix = existing ? ` [${existing}]` : "";
  const value = (await rl.question(`${prompt}${suffix}: `)).trim();
  return value || existing;
}

interface AuthInitOptions {
  serverAddr?: string;
  apiKey?: string;
  force?: boolean;
}

export const authCmd = new Command()
  .name("auth")
  .description("authentication commands");

authCmd
  .command("init")
  .description("setup CLI authentication config")
  .option("--server-addr <addr>", "the address of the server to connect to")
  .option("--api-key <key>", "the API key to interact with the API")
  .option("-f, --force", "overwrite an existing config without confirmation")
  .action(async (rawOpts, command) => {
    const rootOpts = command.parent?.parent?.opts() as AuthInitOptions;
    const opts = {
      serverAddr: rootOpts.serverAddr,
      apiKey: rootOpts.apiKey,
      force: Boolean(rawOpts.force),
    };
    const configPath = getConfigPath();

    try {
      const existingConfig = await loadExistingConfig(opts);
      const existingAuth = normalizeConfig(existingConfig);

      if ((await pathExists(configPath)) && !opts.force) {
        if (!input.isTTY) {
          throw new Error(
            `Config file already exists at ${configPath}. Re-run with --force to overwrite it.`,
          );
        }

        const rl = readline.createInterface({ input, output });
        const answer = (
          await rl.question(
            `Config file already exists at ${configPath}. Update it? (yes/no): `,
          )
        )
          .trim()
          .toLowerCase();
        rl.close();

        if (answer !== "y" && answer !== "yes") {
          printStatusMessage(false, "Auth init aborted by user");
          return;
        }
      }

      const rl = readline.createInterface({ input, output });
      const serverAddr =
        opts.serverAddr ??
        (await promptForValue(
          rl,
          "Karakeep server address",
          existingAuth.serverAddr ?? DEFAULT_SERVER_ADDR,
        ));
      const apiKey =
        opts.apiKey ??
        (await promptForValue(rl, "Karakeep API key", existingAuth.apiKey));
      rl.close();

      if (!serverAddr || !apiKey) {
        throw new Error("Both server address and API key are required");
      }

      await fsp.mkdir(path.dirname(configPath), { recursive: true });
      await fsp.writeFile(
        configPath,
        JSON.stringify(
          {
            ...existingConfig,
            serverAddr,
            apiKey,
          },
          null,
          2,
        ) + "\n",
        {
          encoding: "utf-8",
          mode: 0o600,
        },
      );
      await fsp.chmod(configPath, 0o600);

      printStatusMessage(true, `Wrote auth config to ${configPath}`);
    } catch (error) {
      printStatusMessage(
        false,
        error instanceof Error ? error.message : `${error}`,
      );
      process.exitCode = 1;
    }
  });
