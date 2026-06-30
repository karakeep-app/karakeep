# Model Context Protocol Server (MCP)

Karakeep comes with a Model Context Protocol server that can be used to interact with it through LLMs.

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


### Demo

#### Search
![mcp-1](/img/mcp-1.gif)

#### Adding Text Bookmarks
![mcp-2](/img/mcp-2.gif)

#### Adding URL Bookmarks
![mcp-2](/img/mcp-3.gif)
