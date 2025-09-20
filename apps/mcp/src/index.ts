#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";

import { registerBookmarkTools } from "./bookmarks";
import { registerListTools } from "./lists";
import { config, createMcpServer, logger } from "./shared";
import { registerTagTools } from "./tags";

function buildServer() {
  const server = createMcpServer();
  registerBookmarkTools(server);
  registerListTools(server);
  registerTagTools(server);
  return server;
}

async function startStdioServer() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected using stdio transport.");
}

async function startStreamableHttpServer() {
  const app = express();
  app.use(express.json());

  const sessions: Record<
    string,
    {
      transport: StreamableHTTPServerTransport;
      server: ReturnType<typeof buildServer>;
    }
  > = {};

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      if (sessionId && sessions[sessionId]) {
        await sessions[sessionId].transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const server = buildServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            sessions[newSessionId] = { transport, server };
            logger.info(`Initialized HTTP streamable session ${newSessionId}.`);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            delete sessions[transport.sessionId];
            logger.info(
              `Closed HTTP streamable session ${transport.sessionId}.`,
            );
          }
          server.close();
        };

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
    } catch (error) {
      logger.error("Error handling MCP HTTP POST request", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  const handleSessionRequest = async (
    req: express.Request,
    res: express.Response,
  ) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !sessions[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    try {
      await sessions[sessionId].transport.handleRequest(req, res);
    } catch (error) {
      logger.error(
        `Error handling MCP HTTP ${req.method} request for session ${sessionId}`,
        error,
      );
      if (!res.headersSent) {
        res.status(500).send("Internal server error");
      }
    }
  };

  app.get("/mcp", handleSessionRequest);
  app.delete("/mcp", handleSessionRequest);

  await new Promise<void>((resolve) => {
    app.listen(config.streamPort, () => {
      logger.info(
        `Listening for MCP HTTP streamable connections on port ${config.streamPort}.`,
      );
      resolve();
    });
  });
}

async function run() {
  logger.info(
    `Starting Karakeep MCP server with ${
      config.transportMode === "httpstreamable" ? "HTTP streamable" : "stdio"
    } transport.`,
  );

  if (config.transportMode === "httpstreamable") {
    await startStreamableHttpServer();
    return;
  }

  await startStdioServer();
}

run().catch((error) => {
  logger.error("Fatal error while starting Karakeep MCP server", error);
  process.exitCode = 1;
});
