import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import TurndownService from "turndown";

import { createKarakeepClient } from "@karakeep/sdk";

const addr = process.env.KARAKEEP_API_ADDR;
const apiKey = process.env.KARAKEEP_API_KEY;

export const karakeepClient = createKarakeepClient({
  baseUrl: `${addr}/api/v1`,
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${apiKey}`,
    ...(process.env.KARAKEEP_CUSTOM_HEADERS
      ? JSON.parse(process.env.KARAKEEP_CUSTOM_HEADERS)
      : {}),
  },
});

export const mcpServer = new McpServer({
  name: "Karakeep",
  version: "0.23.0",
});

export const turndownService = new TurndownService();
