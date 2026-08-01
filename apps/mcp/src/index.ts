#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { mcpServer } from "./shared";

import "./assets.ts";
import "./bookmarks.ts";
import "./highlights.ts";
import "./lists.ts";
import "./tags.ts";

async function run() {
  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

run();
