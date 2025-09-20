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

function sanitizeBaseUrl(url: string): string {
  if (url.endsWith("/")) {
    return url.slice(0, -1);
  }
  return url;
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
const apiAddr = sanitizeBaseUrl(rawAddr);
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

export function createMcpServer(): McpServer {
  return new McpServer({
    name: "Karakeep",
    version: "0.23.0",
  });
}
