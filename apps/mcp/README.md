# Karakeep MCP Server

This is the Karakeep MCP server, which is a server that can be used to interact
with Karakeep from other tools.

## Supported Tools

- Searching bookmarks
- Adding and removing bookmarks from lists
- Attaching and detaching tags to bookmarks
- Creating new lists
- Creating text and URL bookmarks

Currently, the MCP server only exposes tools (no resources).

## Usage with Claude Desktop

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
        "KARAKEEP_API_KEY": "<YOUR_TOKEN>",
        "KARAKEEP_CUSTOM_HEADERS": "{\"CF-Access-Client-Id\": \"...\", \"CF-Access-Client-Secret\": \"...\"}"
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
        "-e",
        "KARAKEEP_CUSTOM_HEADERS={\"CF-Access-Client-Id\": \"...\", \"CF-Access-Client-Secret\": \"...\"}",
        "ghcr.io/karakeep-app/karakeep-mcp:latest"
      ]
    }
  }
}
```
