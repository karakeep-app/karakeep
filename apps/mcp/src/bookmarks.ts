import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import { karakeepClient, mcpServer, turndownService } from "./shared";
import { compactBookmark, toMcpToolError } from "./utils";

// Tools
mcpServer.tool(
  "search-bookmarks",
  `Search for bookmarks matching a specific a query.
`,
  {
    query: z.string().describe(`
    By default, this will do a full-text search, but you can also use qualifiers to filter the results.
You can search bookmarks using specific qualifiers. is:fav finds favorited bookmarks,
is:archived searches archived bookmarks, is:tagged finds those with tags,
is:inlist finds those in lists, and is:link, is:text, and is:media filter by bookmark type.
url:<value> searches for URL substrings, #<tag> searches for bookmarks with a specific tag,
list:<name> searches for bookmarks in a specific list given its name (without the icon),
after:<date> finds bookmarks created on or after a date (YYYY-MM-DD), and before:<date> finds bookmarks created on or before a date (YYYY-MM-DD).
If you need to pass names with spaces, you can quote them with double quotes. If you want to negate a qualifier, prefix it with a minus sign.
## Examples:

### Find favorited bookmarks from 2023 that are tagged "important"
is:fav after:2023-01-01 before:2023-12-31 #important

### Find archived bookmarks that are either in "reading" list or tagged "work"
is:archived and (list:reading or #work)

### Combine text search with qualifiers
machine learning is:fav`),
    limit: z
      .number()
      .optional()
      .describe(`The number of results to return in a single query.`)
      .default(10),
    nextCursor: z
      .string()
      .optional()
      .describe(
        `The next cursor to use for pagination. The value for this is returned from a previous call to this tool.`,
      ),
  },
  async ({ query, limit, nextCursor }): Promise<CallToolResult> => {
    const res = await karakeepClient.GET("/bookmarks/search", {
      params: {
        query: {
          q: query,
          limit: limit,
          includeContent: false,
          cursor: nextCursor,
        },
      },
    });
    if (!res.data) {
      return toMcpToolError(res.error);
    }
    return {
      content: [
        {
          type: "text",
          text: `
${res.data.bookmarks.map(compactBookmark).join("\n\n")}

Next cursor: ${res.data.nextCursor ? `'${res.data.nextCursor}'` : "no more pages"}
`,
        },
      ],
    };
  },
);

mcpServer.tool(
  "get-bookmark",
  `Get a bookmark by id.`,
  {
    bookmarkId: z.string().describe(`The bookmarkId to get.`),
  },
  async ({ bookmarkId }): Promise<CallToolResult> => {
    const res = await karakeepClient.GET(`/bookmarks/{bookmarkId}`, {
      params: {
        path: {
          bookmarkId,
        },
        query: {
          includeContent: false,
        },
      },
    });
    if (res.error) {
      return toMcpToolError(res.error);
    }
    return {
      content: [
        {
          type: "text",
          text: compactBookmark(res.data),
        },
      ],
    };
  },
);

mcpServer.tool(
  "create-bookmark",
  `Create a link bookmark or a text bookmark`,
  {
    type: z.enum(["link", "text"]).describe(`The type of bookmark to create.`),
    title: z.string().optional().describe(`The title of the bookmark`),
    content: z
      .string()
      .describe(
        "If type is text, the text to be bookmarked. If the type is link, then it's the URL to be bookmarked.",
      ),
  },
  async ({ title, type, content }): Promise<CallToolResult> => {
    const res = await karakeepClient.POST(`/bookmarks`, {
      body: (
        {
          link: {
            type: "link",
            title,
            url: content,
          },
          text: {
            type: "text",
            title,
            text: content,
          },
        } as const
      )[type],
    });
    if (res.error) {
      return toMcpToolError(res.error);
    }
    return {
      content: [
        {
          type: "text",
          text: compactBookmark(res.data),
        },
      ],
    };
  },
);

mcpServer.tool(
  "get-bookmark-content",
  `Get the content of the bookmark in markdown`,
  {
    bookmarkId: z.string().describe(`The bookmarkId to get content for.`),
  },
  async ({ bookmarkId }): Promise<CallToolResult> => {
    const res = await karakeepClient.GET(`/bookmarks/{bookmarkId}`, {
      params: {
        path: {
          bookmarkId,
        },
        query: {
          includeContent: true,
        },
      },
    });
    if (res.error) {
      return toMcpToolError(res.error);
    }
    let content;
    if (res.data.content.type === "link") {
      const htmlContent = res.data.content.htmlContent;
      content = turndownService.turndown(htmlContent);
    } else if (res.data.content.type === "text") {
      content = res.data.content.text;
    } else if (res.data.content.type === "asset") {
      content = res.data.content.content;
    }
    return {
      content: [
        {
          type: "text",
          text: content ?? "",
        },
      ],
    };
  },
);
