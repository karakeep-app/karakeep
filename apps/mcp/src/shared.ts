import { McpServer } from "@modelcontextprotocol/server";
import type {
  Icon,
  StandardSchemaWithJSON,
  ToolAnnotations,
  ToolCallback,
} from "@modelcontextprotocol/server";
import TurndownService from "turndown";

import { createKarakeepClient } from "@karakeep/sdk";

import packageJson from "../package.json";

const addr = process.env.KARAKEEP_API_ADDR;
const apiKey = process.env.KARAKEEP_API_KEY;

const getCustomHeaders = () => {
  try {
    return process.env.KARAKEEP_CUSTOM_HEADERS
      ? JSON.parse(process.env.KARAKEEP_CUSTOM_HEADERS)
      : {};
  } catch (e) {
    console.error("Failed to parse KARAKEEP_CUSTOM_HEADERS", e);
    return {};
  }
};

export const karakeepClient = createKarakeepClient({
  baseUrl: `${addr}/api/v1`,
  headers: {
    ...getCustomHeaders(),
    "Content-Type": "application/json",
    authorization: `Bearer ${apiKey}`,
  },
});

type ToolRegistration = (server: McpServer) => void;

const toolRegistrations: ToolRegistration[] = [];

export function registerTool<
  OutputArgs extends StandardSchemaWithJSON,
  InputArgs extends StandardSchemaWithJSON | undefined = undefined,
>(
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: InputArgs;
    outputSchema?: OutputArgs;
    annotations?: ToolAnnotations;
    icons?: Icon[];
    _meta?: Record<string, unknown>;
  },
  callback: ToolCallback<InputArgs>,
) {
  toolRegistrations.push((server) => {
    server.registerTool(name, config, callback);
  });
}

export function createMcpServer() {
  const server = new McpServer({
    name: "Karakeep",
    version: packageJson.version,
  });

  for (const register of toolRegistrations) {
    register(server);
  }

  return server;
}

export const turndownService = new TurndownService();
