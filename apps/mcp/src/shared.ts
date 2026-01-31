import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import TurndownService from "turndown";

import { createKarakeepClient } from "@karakeep/sdk";

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

export const mcpServer = new McpServer({
  name: "Karakeep",
  version: "0.23.0",
});

export const turndownService = new TurndownService();
