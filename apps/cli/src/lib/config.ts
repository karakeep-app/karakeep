import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";

export interface CliConfig {
  apiKey?: string;
  serverAddr?: string;
}

export const DEFAULT_SERVER_ADDR = "https://cloud.karakeep.app";

export const zCliConfigFileSchema = z
  .object({
    apiKey: z.string().min(1).optional(),
    serverAddr: z.string().min(1).optional(),
  })
  .passthrough();

export type CliConfigFile = z.infer<typeof zCliConfigFileSchema>;

export function normalizeConfig(config: CliConfigFile): CliConfig {
  return {
    apiKey: config.apiKey,
    serverAddr: config.serverAddr,
  };
}

export function getConfigPath() {
  const configHome =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "karakeep", "config.json");
}

export function loadConfigFile(): CliConfigFile {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8")) as unknown;
  return zCliConfigFileSchema.parse(parsed);
}

export function loadConfig(): CliConfig {
  return normalizeConfig(loadConfigFile());
}
