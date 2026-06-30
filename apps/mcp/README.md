# Karakeep MCP Server

This is the Karakeep MCP server, which is a server that can be used to interact
with Karakeep from other tools.

## Supported Tools

**Bookmarks**
- Searching bookmarks (`search-bookmarks`)
- Reading a bookmark (`get-bookmark`, `get-bookmark-content`)
- Creating text and URL bookmarks (`create-bookmark`)
- Updating a bookmark (`update-bookmark`)
- Deleting a bookmark (`delete-bookmark`)

**Lists**
- Listing all lists (`get-lists`)
- Retrieving a single list (`get-list`)
- Creating a list (`create-list`)
- Updating a list (`update-list`) — name, icon, description, parentId, query, public; field constraints (length caps, smart-query validation) are inherited from the shared schema
- Deleting a list (`delete-list`) — child lists are NOT deleted with the parent; they keep their parentId pointing at the deleted list
- Adding and removing bookmarks from lists (`add-bookmark-to-list`, `remove-bookmark-from-list`)

**Tags**
- Listing tags with filters / pagination (`get-tags`)
- Retrieving a single tag with usage counts (`get-tag`)
- Renaming a tag (`update-tag`)
- Deleting a tag (`delete-tag`) — bookmarks that had the tag are not deleted
- Listing the bookmarks attached to a tag (`get-tag-bookmarks`)
- Attaching and detaching tags on bookmarks (`attach-tag-to-bookmark`, `detach-tag-from-bookmark`)

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
