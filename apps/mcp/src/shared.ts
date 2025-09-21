import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import TurndownService from "turndown";

import { createKarakeepClient } from "@karakeep/sdk";

type TransportMode = "stdio" | "httpstreamable";

const logPrefix = "[karakeep-mcp]";

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "object") {
    return JSON.stringify(error);
  }

  return String(error);
}

function createLogger() {
  return {
    info(message: string) {
      console.log(`${logPrefix} ${message}`);
    },
    warn(message: string) {
      console.warn(`${logPrefix} ${message}`);
    },
    error(message: string, error?: unknown) {
      if (error) {
        console.error(`${logPrefix} ${message}: ${formatError(error)}`);
        return;
      }
      console.error(`${logPrefix} ${message}`);
    },
  };
}

export const logger = createLogger();

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    logger.error(`Missing required environment variable '${name}'.`);
    process.exit(1);
  }
  return value;
}

function normalizeApiAddress(rawUrl: string): string {
  const value = rawUrl.trim();

  if (!/^https?:\/\//i.test(value)) {
    logger.error(
      `Invalid KARAKEEP_API_ADDR value '${rawUrl}'. Please include the protocol, e.g. 'https://app.karakeep.com'.`,
    );
    process.exit(1);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    logger.error(
      `Invalid KARAKEEP_API_ADDR value '${rawUrl}'. ${formatError(error)}`,
    );
    process.exit(1);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    logger.error(
      `Invalid KARAKEEP_API_ADDR value '${rawUrl}'. Only HTTP and HTTPS URLs are supported.`,
    );
    process.exit(1);
  }

  parsed.hash = "";
  parsed.search = "";

  let normalized = parsed.toString();
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function resolveTransportMode(): TransportMode {
  const rawValue = process.env.KARAKEEP_MCP_TRANSPORT?.trim();
  if (!rawValue || rawValue.toLowerCase() === "nothing") {
    return "stdio";
  }

  if (rawValue.toLowerCase() === "httpstreamable") {
    return "httpstreamable";
  }

  logger.warn(
    `Unknown KARAKEEP_MCP_TRANSPORT value '${rawValue}'. Falling back to stdio transport.`,
  );
  return "stdio";
}

function resolveStreamPort(): number {
  const defaultPort = 3000;
  const rawValue = process.env.KARAKEEP_MCP_STREAM_PORT?.trim();
  if (!rawValue) {
    return defaultPort;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    logger.warn(
      `Invalid KARAKEEP_MCP_STREAM_PORT value '${rawValue}'. Falling back to ${defaultPort}.`,
    );
    return defaultPort;
  }

  return parsed;
}

const rawAddr = readRequiredEnv("KARAKEEP_API_ADDR");
const apiAddr = normalizeApiAddress(rawAddr);
const apiKey = readRequiredEnv("KARAKEEP_API_KEY");

const transportMode = resolveTransportMode();
const streamPort = resolveStreamPort();

export const config = {
  apiAddr,
  transportMode,
  streamPort,
} satisfies {
  apiAddr: string;
  transportMode: TransportMode;
  streamPort: number;
};

logger.info(`Connecting to Karakeep API at ${config.apiAddr}`);
logger.info(
  `Selected transport: ${
    config.transportMode === "httpstreamable" ? "HTTP streamable" : "stdio"
  }`,
);
if (config.transportMode === "httpstreamable") {
  logger.info(
    `HTTP streamable transport configured to listen on port ${config.streamPort}`,
  );
}

export const karakeepClient = createKarakeepClient({
  baseUrl: `${config.apiAddr}/api/v1`,
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${apiKey}`,
  },
});

export const turndownService = new TurndownService();

export async function verifyKarakeepApiAccess(): Promise<void> {
  logger.info("Verifying Karakeep API credentials...");

  const response = await karakeepClient
    .GET("/users/me")
    .catch((error: unknown): never => {
      throw new Error(
        `Unable to reach Karakeep API at ${config.apiAddr}: ${formatError(error)}`,
      );
    });

  if (!response.response?.ok) {
    const status = response.response?.status;
    const statusText = response.response?.statusText;
    const statusMessage =
      status !== undefined
        ? `status ${status}${statusText ? ` (${statusText})` : ""}`
        : "an unknown status";

    const errorPayload = (response as { error?: unknown }).error;
    const errorMessage =
      errorPayload !== undefined
        ? formatError(errorPayload)
        : "No error payload returned.";

    throw new Error(
      `Karakeep API key verification failed with ${statusMessage}: ${errorMessage}`,
    );
  }

  const user = response.data;
  if (!user) {
    throw new Error(
      "Karakeep API key verification succeeded but returned no user payload.",
    );
  }

  const { email, name, id } = user;
  const identity = email ?? name ?? id;

  logger.info(
    `Karakeep API key verified${
      identity ? ` (authenticated as ${identity})` : ""
    }.`,
  );
}

export function createMcpServer(): McpServer {
  return new McpServer({
    name: "Karakeep",
    version: "0.23.0",
  });
}
