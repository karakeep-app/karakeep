# Karakeep MCP Server

This is the Karakeep MCP server, which is a server that can be used to interact with Karakeep from other tools.

## Supported Tools

- Searching bookmarks
- Adding and removing bookmarks from lists
- Attaching and detaching tags to bookmarks
- Creating new lists
- Creating text and URL bookmarks

Currently, the MCP server only exposes tools (no resources).

## Usage with Claude Desktop (stdio transport)

From NPM:

```json
{
  "mcpServers": {
    "karakeep": {
      "command": "npx",
      "args": [
        "@karakeep/mcp"
      ],
      "env": {
        "KARAKEEP_API_ADDR": "https://<YOUR_SERVER_ADDR>",
        "KARAKEEP_API_KEY": "<YOUR_TOKEN>"
      }
    }
  }
}
```

From Docker:

```json
{
  "mcpServers": {
    "karakeep": {
      "command": "docker",
      "args": [
        "run",
        "-e",
        "KARAKEEP_API_ADDR=https://<YOUR_SERVER_ADDR>",
        "-e",
        "KARAKEEP_API_KEY=<YOUR_TOKEN>",
        "ghcr.io/karakeep-app/karakeep-mcp:latest"
      ]
    }
  }
}
```

## Running from a terminal (stdio transport)

If you prefer to launch the stdio transport directly from a terminal without
going through a Claude manifest, you can run:

```bash
KARAKEEP_API_ADDR=https://<YOUR_SERVER_ADDR> \
KARAKEEP_API_KEY=<YOUR_TOKEN> \
npx @karakeep/mcp
```

Or with Docker:

```bash
docker run \
  -e KARAKEEP_API_ADDR=https://<YOUR_SERVER_ADDR> \
  -e KARAKEEP_API_KEY=<YOUR_TOKEN> \
  ghcr.io/karakeep-app/karakeep-mcp:latest
```

## HTTP Streamable transport (terminal only)

The HTTP Streamable mode is intended for terminal usage and is not supported by
Claude Desktop manifests. Enable it by setting
`KARAKEEP_MCP_TRANSPORT=HTTPstreamable` and, optionally,
`KARAKEEP_MCP_STREAM_PORT` (defaults to `3000`).

```bash
KARAKEEP_API_ADDR=https://<YOUR_SERVER_ADDR> \
KARAKEEP_API_KEY=<YOUR_TOKEN> \
KARAKEEP_MCP_TRANSPORT=HTTPstreamable \
KARAKEEP_MCP_STREAM_PORT=3000 \
npx @karakeep/mcp
```

Example Docker usage:

```bash
docker run \
  -e KARAKEEP_API_ADDR=https://<YOUR_SERVER_ADDR> \
  -e KARAKEEP_API_KEY=<YOUR_TOKEN> \
  -e KARAKEEP_MCP_TRANSPORT=HTTPstreamable \
  -e KARAKEEP_MCP_STREAM_PORT=3000 \
  -p 3000:3000 \
  ghcr.io/karakeep-app/karakeep-mcp:latest
```
