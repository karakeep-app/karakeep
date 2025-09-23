# Model Context Protocol Server (MCP)

Karakeep comes with a Model Context Protocol server that can be used to interact with it through LLMs.

## Supported Tools

- Searching bookmarks
- Adding and removing bookmarks from lists
- Attaching and detaching tags to bookmarks
- Creating new lists
- Creating text and URL bookmarks


## Building from source

Build the MCP server locally from the repository root with pnpm:

```bash
pnpm install
pnpm --filter @karakeep/mcp build
pnpm --filter @karakeep/mcp run
```

The build step emits the executable at `apps/mcp/dist/index.js`. Before
running the compiled binary (either via the `run` script or with
`node apps/mcp/dist/index.js`), export the required API credentials and any
transport overrides:

```bash
export KARAKEEP_API_ADDR="https://<YOUR_SERVER_ADDR>"
export KARAKEEP_API_KEY="<YOUR_TOKEN>"
# Optional transport configuration
export KARAKEEP_MCP_TRANSPORT=HTTPstreamable
export KARAKEEP_MCP_STREAM_PORT=3000
```

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

To run the stdio transport directly from a terminal without a Claude manifest,
use one of the following options:

```bash
KARAKEEP_API_ADDR=https://<YOUR_SERVER_ADDR> \
KARAKEEP_API_KEY=<YOUR_TOKEN> \
npx @karakeep/mcp
```

```bash
docker run \
  -e KARAKEEP_API_ADDR=https://<YOUR_SERVER_ADDR> \
  -e KARAKEEP_API_KEY=<YOUR_TOKEN> \
  ghcr.io/karakeep-app/karakeep-mcp:latest
```

## HTTP Streamable transport (terminal only)

The HTTP Streamable transport is limited to terminal-based workflows and is not
available through Claude Desktop manifests. Enable it with
`KARAKEEP_MCP_TRANSPORT=HTTPstreamable`; the port can be overridden with
`KARAKEEP_MCP_STREAM_PORT` (default: `3000`).

```bash
KARAKEEP_API_ADDR=https://<YOUR_SERVER_ADDR> \
KARAKEEP_API_KEY=<YOUR_TOKEN> \
KARAKEEP_MCP_TRANSPORT=HTTPstreamable \
KARAKEEP_MCP_STREAM_PORT=3000 \
npx @karakeep/mcp
```

```bash
docker run \
  -e KARAKEEP_API_ADDR=https://<YOUR_SERVER_ADDR> \
  -e KARAKEEP_API_KEY=<YOUR_TOKEN> \
  -e KARAKEEP_MCP_TRANSPORT=HTTPstreamable \
  -e KARAKEEP_MCP_STREAM_PORT=3000 \
  -p 3000:3000 \
  ghcr.io/karakeep-app/karakeep-mcp:latest
```


### Demo

#### Search
![mcp-1](/img/mcp-1.gif)

#### Adding Text Bookmarks
![mcp-2](/img/mcp-2.gif)

#### Adding URL Bookmarks
![mcp-2](/img/mcp-3.gif)
