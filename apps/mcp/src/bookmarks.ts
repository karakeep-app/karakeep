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
    if (!res.data) {
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
      body:
        type === "link"
          ? {
              type: "link",
              title,
              url: content,
            }
          : {
              type: "text",
              title,
              text: content,
            },
    });
    if (!res.data) {
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
  "update-bookmark",
  `Update fields on an existing bookmark. Only the fields you pass are modified; omitted fields stay unchanged. Returns the updated bookmark.`,
  {
    bookmarkId: z.string().describe(`The bookmarkId to update.`),
    title: z
      .string()
      .nullable()
      .optional()
      .describe(`The bookmark's user-set title. Pass null to clear it.`),
    note: z.string().optional().describe(`A free-form note on the bookmark.`),
    summary: z
      .string()
      .nullable()
      .optional()
      .describe(`The bookmark's summary. Pass null to clear it.`),
    archived: z
      .boolean()
      .optional()
      .describe(`Whether the bookmark is archived.`),
    favourited: z
      .boolean()
      .optional()
      .describe(`Whether the bookmark is favourited.`),
    url: z.string().url().optional().describe(`New URL for a link bookmark.`),
    description: z
      .string()
      .nullable()
      .optional()
      .describe(`Link description. Pass null to clear it.`),
    author: z
      .string()
      .nullable()
      .optional()
      .describe(`Link author. Pass null to clear it.`),
    publisher: z
      .string()
      .nullable()
      .optional()
      .describe(`Link publisher. Pass null to clear it.`),
    createdAt: z
      .string()
      .datetime()
      .optional()
      .describe(`Override the bookmark's createdAt timestamp (ISO 8601).`),
  },
  async ({ bookmarkId, ...fields }): Promise<CallToolResult> => {
    const patchRes = await karakeepClient.PATCH(`/bookmarks/{bookmarkId}`, {
      params: {
        path: {
          bookmarkId,
        },
      },
      body: fields,
    });
    if (!patchRes.data) {
      return toMcpToolError(patchRes.error);
    }
    const getRes = await karakeepClient.GET(`/bookmarks/{bookmarkId}`, {
      params: {
        path: {
          bookmarkId,
        },
        query: {
          includeContent: false,
        },
      },
    });
    if (!getRes.data) {
      return toMcpToolError(getRes.error);
    }
    return {
      content: [
        {
          type: "text",
          text: compactBookmark(getRes.data),
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
    if (!res.data) {
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
