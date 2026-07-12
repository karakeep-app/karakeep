import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "typebox";
import type { TSchema } from "typebox";

import {
  BookmarkTypes,
  zSearchBookmarksCursor,
} from "@karakeep/shared/types/bookmarks";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import type { ZHighlight } from "@karakeep/shared/types/highlights";
import { zCursorV2 } from "@karakeep/shared/types/pagination";
import { htmlToPlainText } from "@karakeep/shared/utils/htmlUtils";
import { logEvent } from "@karakeep/shared-server";
import { createCallerFactory } from "../../index";
import type { AuthedContext } from "../../index";
import { bookmarksAppRouter } from "../bookmarks";
import { highlightsAppRouter } from "../highlights";
import { listsAppRouter } from "../lists";
import { tagsAppRouter } from "../tags";
import type { CacheInvalidationHandle } from "./contracts";

const createBookmarksCaller = createCallerFactory(bookmarksAppRouter);
const createHighlightsCaller = createCallerFactory(highlightsAppRouter);
const createListsCaller = createCallerFactory(listsAppRouter);
const createTagsCaller = createCallerFactory(tagsAppRouter);

function compactBookmark(bookmark: ZBookmark) {
  let content: string;
  if (bookmark.content.type === BookmarkTypes.LINK) {
    content = `Bookmark type: link
Bookmarked URL: ${bookmark.content.url}
description: ${bookmark.content.description ?? ""}
author: ${bookmark.content.author ?? ""}
publisher: ${bookmark.content.publisher ?? ""}`;
  } else if (bookmark.content.type === BookmarkTypes.TEXT) {
    content = `Bookmark type: text
Source URL: ${bookmark.content.sourceUrl ?? ""}`;
  } else if (bookmark.content.type === BookmarkTypes.ASSET) {
    content = `Bookmark type: media
Asset ID: ${bookmark.content.assetId}
Asset type: ${bookmark.content.assetType}
Source URL: ${bookmark.content.sourceUrl ?? ""}`;
  } else {
    content = "Bookmark type: unknown";
  }

  return `Bookmark ID: ${bookmark.id}
Created at: ${bookmark.createdAt.toISOString()}
Title: ${
    bookmark.title
      ? bookmark.title
      : ((bookmark.content.type === BookmarkTypes.LINK
          ? bookmark.content.title
          : "") ?? "")
  }
Summary: ${bookmark.summary ?? ""}
Note: ${bookmark.note ?? ""}
${content}
Tags: ${bookmark.tags.map((tag) => tag.name).join(", ")}`;
}

function bookmarkContentToText(bookmark: ZBookmark) {
  if (bookmark.content.type === BookmarkTypes.LINK) {
    return bookmark.content.htmlContent
      ? htmlToPlainText(bookmark.content.htmlContent)
      : "";
  }

  if (bookmark.content.type === BookmarkTypes.TEXT) {
    return bookmark.content.text;
  }

  if (bookmark.content.type === BookmarkTypes.ASSET) {
    return bookmark.content.content ?? "";
  }

  return "";
}

function textToolResult(text: string, details: unknown = null) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function stringEnum<T extends readonly string[]>(
  values: T,
  options?: { default?: T[number]; description?: string },
) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    ...options,
  });
}

const nullableString = (description: string) =>
  Type.Union([Type.String(), Type.Null()], { description });

/**
 * A chat tool paired with the client query caches its execution dirties.
 * Co-locating `invalidates` with each tool definition keeps a tool's behaviour
 * and its side effects in one place: adding or renaming a tool can no longer
 * silently desync from a separate name-keyed lookup table. The agent runtime
 * only ever sees the underlying `tool`.
 */
interface ChatToolEntry {
  tool: AgentTool;
  invalidates?: CacheInvalidationHandle[];
}

function tool<TParameters extends TSchema, TDetails = unknown>(
  definition: AgentTool<TParameters, TDetails> & {
    invalidates?: CacheInvalidationHandle[];
  },
): ChatToolEntry {
  const { invalidates } = definition;
  // Re-type as a plain AgentTool so the collected list of heterogeneous tools
  // widens to `AgentTool[]` (the agent's tool list) without tripping the
  // contravariant `execute` parameter check that an `& { invalidates }`
  // intersection would.
  const agentTool: AgentTool<TParameters, TDetails> = definition;
  return { tool: agentTool, invalidates };
}

function withChatToolUsageLogging(
  ctx: AuthedContext,
  entries: ChatToolEntry[],
): AgentTool[] {
  return entries.map(({ tool, invalidates }): AgentTool => {
    const execute: AgentTool["execute"] = async (
      toolCallId,
      params,
      signal,
      onUpdate,
    ) => {
      const startedAt = Date.now();
      try {
        const result = await tool.execute(toolCallId, params, signal, onUpdate);
        const trpcHandles = invalidates ?? [];
        if (trpcHandles.length > 0) {
          onUpdate?.(
            textToolResult("", {
              cacheInvalidation: { trpcHandles },
            }),
          );
        }
        logEvent({
          "event.name": "chat.tool_call",
          "user.id": ctx.user.id,
          "chat.tool.name": tool.name,
          "chat.tool.call_id": toolCallId,
          "chat.tool.success": true,
          "chat.tool.duration_ms": Date.now() - startedAt,
        });
        return result;
      } catch (error) {
        logEvent({
          "event.name": "chat.tool_call",
          "user.id": ctx.user.id,
          "chat.tool.name": tool.name,
          "chat.tool.call_id": toolCallId,
          "chat.tool.success": false,
          "chat.tool.duration_ms": Date.now() - startedAt,
          "chat.tool.error":
            error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };

    return { ...tool, execute };
  });
}

function parseSearchCursor(nextCursor: string | undefined) {
  if (!nextCursor) {
    return undefined;
  }

  return zSearchBookmarksCursor.parse(JSON.parse(nextCursor));
}

function parseCursorV2(nextCursor: string | undefined) {
  if (!nextCursor) {
    return undefined;
  }

  return zCursorV2.parse(
    JSON.parse(nextCursor, (key, value) =>
      key === "createdAt" && typeof value === "string"
        ? new Date(value)
        : value,
    ),
  );
}

function serializeCursor(cursor: unknown) {
  return cursor ? JSON.stringify(cursor) : null;
}

function compactHighlight(highlight: ZHighlight) {
  return `Highlight ID: ${highlight.id}
Bookmark ID: ${highlight.bookmarkId}
Created at: ${highlight.createdAt.toISOString()}
Color: ${highlight.color}
Text: ${highlight.text ?? ""}
Note: ${highlight.note ?? ""}`;
}

export function createChatTools(ctx: AuthedContext): AgentTool[] {
  const bookmarksApi = createBookmarksCaller(ctx);
  const highlightsApi = createHighlightsCaller(ctx);
  const listsApi = createListsCaller(ctx);
  const tagsApi = createTagsCaller(ctx);

  const tools = [
    tool({
      name: "search-bookmarks",
      label: "Search bookmarks",
      description: `Search for bookmarks matching a specific a query.

By default, this will do a full-text search, but you can also use qualifiers to filter the results.
You can search bookmarks using specific qualifiers. is:fav finds favorited bookmarks,
is:archived searches archived bookmarks, is:tagged finds those with tags,
is:inlist finds those in lists, and is:link, is:text, and is:media filter by bookmark type.
url:<value> searches for URL substrings, #<tag> searches for bookmarks with a specific tag,
list:<name> searches for bookmarks in a specific list given its name (without the icon),
after:<date> finds bookmarks created on or after a date (YYYY-MM-DD), and before:<date> finds bookmarks created on or before a date (YYYY-MM-DD).
If you need to pass names with spaces, you can quote them with double quotes. If you want to negate a qualifier, prefix it with a minus sign.`,
      parameters: Type.Object(
        {
          query: Type.String({ description: "The search query." }),
          limit: Type.Optional(
            Type.Integer({
              minimum: 1,
              maximum: 100,
              default: 10,
              description: "The number of results to return in a single query.",
            }),
          ),
          nextCursor: Type.Optional(
            Type.String({
              description:
                "The next cursor to use for pagination. The value for this is returned from a previous call to this tool.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = {
          limit: 10,
          ...params,
        };

        const result = await bookmarksApi.searchBookmarks({
          text: input.query,
          limit: input.limit,
          includeContent: false,
          cursor: parseSearchCursor(input.nextCursor),
        });
        const nextCursor = serializeCursor(result.nextCursor);
        return textToolResult(
          `${result.bookmarks.map(compactBookmark).join("\n\n")}

Next cursor: ${nextCursor ?? "no more pages"}`,
          result,
        );
      },
    }),
    tool({
      name: "list-bookmarks",
      label: "List bookmarks",
      description:
        "List recent bookmarks, optionally filtered by archived/favourited state, tag id, list id, or bookmark ids.",
      parameters: Type.Object(
        {
          ids: Type.Optional(
            Type.Array(Type.String(), {
              description: "Specific bookmark ids to fetch.",
            }),
          ),
          archived: Type.Optional(
            Type.Boolean({
              description:
                "Filter by archived state. Omit this to include both archived and unarchived bookmarks.",
            }),
          ),
          favourited: Type.Optional(
            Type.Boolean({
              description:
                "Filter by favourited state. Omit this to include both favourited and non-favourited bookmarks.",
            }),
          ),
          tagId: Type.Optional(
            Type.String({
              description: "Only return bookmarks with this tag id.",
            }),
          ),
          listId: Type.Optional(
            Type.String({
              description: "Only return bookmarks in this list id.",
            }),
          ),
          sortOrder: Type.Optional(
            stringEnum(["asc", "desc"] as const, {
              default: "desc",
              description: "Sort by bookmark creation time.",
            }),
          ),
          limit: Type.Optional(
            Type.Integer({
              minimum: 1,
              maximum: 100,
              default: 20,
              description: "The number of results to return in a single query.",
            }),
          ),
          nextCursor: Type.Optional(
            Type.String({
              description:
                "The next cursor to use for pagination. The value for this is returned from a previous call to this tool.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = {
          sortOrder: "desc" as const,
          limit: 20,
          ...params,
        };
        const result = await bookmarksApi.getBookmarks({
          ids: input.ids,
          archived: input.archived,
          favourited: input.favourited,
          tagId: input.tagId,
          listId: input.listId,
          sortOrder: input.sortOrder,
          limit: input.limit,
          cursor: parseCursorV2(input.nextCursor),
          includeContent: false,
          useCursorV2: true,
        });
        const nextCursor = serializeCursor(result.nextCursor);
        return textToolResult(
          `${result.bookmarks.map(compactBookmark).join("\n\n")}

Next cursor: ${nextCursor ?? "no more pages"}`,
          result,
        );
      },
    }),
    tool({
      name: "get-bookmark",
      label: "Get bookmark",
      description: "Get a bookmark by id.",
      parameters: Type.Object(
        {
          bookmarkId: Type.String({ description: "The bookmarkId to get." }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const bookmark = await bookmarksApi.getBookmark({
          bookmarkId: input.bookmarkId,
          includeContent: false,
        });
        return textToolResult(compactBookmark(bookmark), bookmark);
      },
    }),
    tool({
      name: "create-bookmark",
      label: "Create bookmark",
      description: "Create a link bookmark or a text bookmark.",
      invalidates: [
        "bookmarks.getBookmarks",
        "bookmarks.searchBookmarks",
        "lists.stats",
      ],
      parameters: Type.Object(
        {
          type: stringEnum(["link", "text"] as const, {
            description: "The type of bookmark to create.",
          }),
          title: Type.Optional(
            Type.String({ description: "The title of the bookmark." }),
          ),
          content: Type.String({
            description:
              "If type is text, the text to be bookmarked. If the type is link, then it's the URL to be bookmarked.",
          }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const bookmark =
          input.type === "link"
            ? await bookmarksApi.createBookmark({
                type: BookmarkTypes.LINK,
                title: input.title,
                url: input.content,
                source: "api",
              })
            : await bookmarksApi.createBookmark({
                type: BookmarkTypes.TEXT,
                title: input.title,
                text: input.content,
                source: "api",
              });
        return textToolResult(compactBookmark(bookmark), bookmark);
      },
    }),
    tool({
      name: "update-bookmark",
      label: "Update bookmark",
      description:
        "Update fields on an existing bookmark. Only the fields you pass are modified; omitted fields stay unchanged. Returns the updated bookmark.",
      invalidates: [
        "bookmarks.getBookmark",
        "bookmarks.getBookmarks",
        "bookmarks.searchBookmarks",
        // Archiving/favouriting/re-dating can change smart-list membership.
        "lists.getListsOfBookmark",
        "lists.stats",
      ],
      parameters: Type.Object(
        {
          bookmarkId: Type.String({ description: "The bookmarkId to update." }),
          title: Type.Optional(
            nullableString(
              "The bookmark's user-set title. Pass null to clear it.",
            ),
          ),
          note: Type.Optional(
            Type.String({ description: "A free-form note on the bookmark." }),
          ),
          summary: Type.Optional(
            nullableString("The bookmark's summary. Pass null to clear it."),
          ),
          archived: Type.Optional(
            Type.Boolean({ description: "Whether the bookmark is archived." }),
          ),
          favourited: Type.Optional(
            Type.Boolean({
              description: "Whether the bookmark is favourited.",
            }),
          ),
          url: Type.Optional(
            Type.String({
              format: "uri",
              description: "New URL for a link bookmark.",
            }),
          ),
          description: Type.Optional(
            nullableString("Link description. Pass null to clear it."),
          ),
          author: Type.Optional(
            nullableString("Link author. Pass null to clear it."),
          ),
          publisher: Type.Optional(
            nullableString("Link publisher. Pass null to clear it."),
          ),
          createdAt: Type.Optional(
            Type.String({
              format: "date-time",
              description:
                "Override the bookmark's createdAt timestamp (ISO 8601).",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const bookmark = await bookmarksApi.updateBookmark({
          ...input,
          createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
        });
        return textToolResult(compactBookmark(bookmark), bookmark);
      },
    }),
    tool({
      name: "get-bookmark-content",
      label: "Get bookmark content",
      description: "Get the content of the bookmark in markdown.",
      parameters: Type.Object(
        {
          bookmarkId: Type.String({
            description: "The bookmarkId to get content for.",
          }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const bookmark = await bookmarksApi.getBookmark({
          bookmarkId: input.bookmarkId,
          includeContent: true,
        });
        return textToolResult(bookmarkContentToText(bookmark), {
          bookmarkId: input.bookmarkId,
        });
      },
    }),
    tool({
      name: "delete-bookmark",
      label: "Delete bookmark",
      description:
        "Permanently delete a bookmark. Only use this when the user explicitly asks to delete a bookmark.",
      invalidates: [
        "bookmarks.getBookmark",
        "bookmarks.getBookmarks",
        "bookmarks.searchBookmarks",
        "lists.getListsOfBookmark",
        "lists.stats",
      ],
      parameters: Type.Object(
        {
          bookmarkId: Type.String({ description: "The bookmarkId to delete." }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        await bookmarksApi.deleteBookmark(input);
        return textToolResult(`Bookmark ${input.bookmarkId} deleted`, input);
      },
    }),
    tool({
      name: "get-lists",
      label: "Get lists",
      description: "Retrieves all lists with bookmark counts.",
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute() {
        const [result, statsResult] = await Promise.all([
          listsApi.list(),
          listsApi.stats(),
        ]);
        return textToolResult(
          result.lists
            .map(
              (list) => `List ID: ${list.id}
Name: ${list.name}
Icon: ${list.icon}
Type: ${list.type}
Description: ${list.description ?? ""}
Query: ${list.query ?? ""}
Parent ID: ${list.parentId}
Bookmark count: ${statsResult.stats.get(list.id) ?? 0}`,
            )
            .join("\n\n"),
          { ...result, stats: statsResult.stats },
        );
      },
    }),
    tool({
      name: "get-list",
      label: "Get list",
      description: "Get a list by id.",
      parameters: Type.Object(
        {
          listId: Type.String({ description: "The list id to get." }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const list = await listsApi.get(input);
        return textToolResult(
          `List ID: ${list.id}
Name: ${list.name}
Icon: ${list.icon}
Type: ${list.type}
Description: ${list.description ?? ""}
Query: ${list.query ?? ""}
Parent ID: ${list.parentId}
Public: ${list.public ? "yes" : "no"}
Role: ${list.userRole}`,
          list,
        );
      },
    }),
    tool({
      name: "get-bookmark-lists",
      label: "Get bookmark lists",
      description: "Get the lists that contain a bookmark.",
      parameters: Type.Object(
        {
          bookmarkId: Type.String({ description: "The bookmark id." }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const result = await listsApi.getListsOfBookmark(input);
        return textToolResult(
          result.lists
            .map(
              (list) => `List ID: ${list.id}
Name: ${list.name}
Icon: ${list.icon}
Type: ${list.type}`,
            )
            .join("\n\n"),
          result,
        );
      },
    }),
    tool({
      name: "add-bookmark-to-list",
      label: "Add bookmark to list",
      description: "Add a bookmark to a list.",
      invalidates: [
        "bookmarks.getBookmarks",
        // `list:` search results depend on list membership.
        "bookmarks.searchBookmarks",
        "lists.getListsOfBookmark",
        "lists.stats",
      ],
      parameters: Type.Object(
        {
          listId: Type.String({
            description: "The listId to add the bookmark to.",
          }),
          bookmarkId: Type.String({ description: "The bookmarkId to add." }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        await listsApi.addToList(input);
        return textToolResult(
          `Bookmark ${input.bookmarkId} added to list ${input.listId}`,
          input,
        );
      },
    }),
    tool({
      name: "remove-bookmark-from-list",
      label: "Remove bookmark from list",
      description: "Remove a bookmark from a list.",
      invalidates: [
        "bookmarks.getBookmarks",
        // `list:` search results depend on list membership.
        "bookmarks.searchBookmarks",
        "lists.getListsOfBookmark",
        "lists.stats",
      ],
      parameters: Type.Object(
        {
          listId: Type.String({
            description: "The listId to remove the bookmark from.",
          }),
          bookmarkId: Type.String({ description: "The bookmarkId to remove." }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        await listsApi.removeFromList(input);
        return textToolResult(
          `Bookmark ${input.bookmarkId} removed from list ${input.listId}`,
          input,
        );
      },
    }),
    tool({
      name: "create-list",
      label: "Create list",
      description:
        "Create a manual list or a smart list. Smart lists require a query made only of search qualifiers.",
      invalidates: ["lists.list"],
      parameters: Type.Object(
        {
          name: Type.String({ description: "The name of the list." }),
          icon: Type.String({ description: "The emoji icon of the list." }),
          type: Type.Optional(
            stringEnum(["manual", "smart"] as const, {
              default: "manual",
              description: "The type of list to create.",
            }),
          ),
          description: Type.Optional(
            Type.String({ description: "A description for the list." }),
          ),
          query: Type.Optional(
            Type.String({
              description:
                "The search query for a smart list. It must use search qualifiers and no unqualified full-text terms.",
            }),
          ),
          parentId: Type.Optional(
            Type.String({ description: "The parent list id of this list." }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = {
          type: "manual" as const,
          ...params,
        };
        const list = await listsApi.create(input);
        return textToolResult(
          `List ${list.name} created with id ${list.id}`,
          list,
        );
      },
    }),
    tool({
      name: "update-list",
      label: "Update list",
      description:
        "Update a list's name, icon, description, parent, smart-list query, or public state.",
      invalidates: ["bookmarks.getBookmarks", "lists.get", "lists.list"],
      parameters: Type.Object(
        {
          listId: Type.String({ description: "The list id to update." }),
          name: Type.Optional(
            Type.String({ description: "The new list name." }),
          ),
          icon: Type.Optional(
            Type.String({ description: "The new emoji icon." }),
          ),
          description: Type.Optional(
            nullableString("The new description. Pass null to clear it."),
          ),
          parentId: Type.Optional(
            nullableString(
              "The new parent list id. Pass null to move to root.",
            ),
          ),
          query: Type.Optional(
            Type.String({
              description:
                "The smart-list query. It must use search qualifiers and no unqualified full-text terms.",
            }),
          ),
          public: Type.Optional(
            Type.Boolean({
              description: "Whether the list is publicly shared.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const list = await listsApi.edit(input);
        return textToolResult(
          `List ${list.name} updated with id ${list.id}`,
          list,
        );
      },
    }),
    tool({
      name: "delete-list",
      label: "Delete list",
      description:
        "Delete a list. Only use this when the user explicitly asks to delete a list.",
      invalidates: [
        "bookmarks.getBookmarks",
        "lists.get",
        "lists.list",
        "lists.stats",
      ],
      parameters: Type.Object(
        {
          listId: Type.String({ description: "The list id to delete." }),
          deleteChildren: Type.Optional(
            Type.Boolean({
              default: false,
              description: "Whether to also delete child lists.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = {
          deleteChildren: false,
          ...params,
        };
        await listsApi.delete(input);
        return textToolResult(`List ${input.listId} deleted`, input);
      },
    }),
    tool({
      name: "attach-tag-to-bookmark",
      label: "Attach tag to bookmark",
      description: "Attach a tag to a bookmark.",
      invalidates: [
        "bookmarks.getBookmark",
        "bookmarks.getBookmarks",
        "bookmarks.searchBookmarks",
        "tags.get",
        "tags.list",
        // Tag changes can move bookmarks in/out of tag-based smart lists.
        "lists.getListsOfBookmark",
        "lists.stats",
      ],
      parameters: Type.Object(
        {
          bookmarkId: Type.String({
            description: "The bookmarkId to attach the tag to.",
          }),
          tagsToAttach: Type.Array(Type.String(), {
            description: "The tag names to attach.",
          }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        await bookmarksApi.updateTags({
          bookmarkId: input.bookmarkId,
          attach: input.tagsToAttach.map(
            (tagName): { tagName: string; attachedBy: "ai" } => ({
              tagName,
              attachedBy: "ai",
            }),
          ),
          detach: [],
        });
        return textToolResult(
          `Tags ${JSON.stringify(input.tagsToAttach)} attached to bookmark ${input.bookmarkId}`,
          input,
        );
      },
    }),
    tool({
      name: "detach-tag-from-bookmark",
      label: "Detach tag from bookmark",
      description: "Detach a tag from a bookmark.",
      invalidates: [
        "bookmarks.getBookmark",
        "bookmarks.getBookmarks",
        "bookmarks.searchBookmarks",
        "tags.get",
        "tags.list",
        // Tag changes can move bookmarks in/out of tag-based smart lists.
        "lists.getListsOfBookmark",
        "lists.stats",
      ],
      parameters: Type.Object(
        {
          bookmarkId: Type.String({
            description: "The bookmarkId to detach the tag from.",
          }),
          tagsToDetach: Type.Array(Type.String(), {
            description: "The tag names to detach.",
          }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        await bookmarksApi.updateTags({
          bookmarkId: input.bookmarkId,
          attach: [],
          detach: input.tagsToDetach.map((tagName) => ({ tagName })),
        });
        return textToolResult(
          `Tags ${JSON.stringify(input.tagsToDetach)} detached from bookmark ${input.bookmarkId}`,
          input,
        );
      },
    }),
    tool({
      name: "list-tags",
      label: "List tags",
      description:
        "List tags with usage counts, optionally filtered by name or attached-by source.",
      parameters: Type.Object(
        {
          nameContains: Type.Optional(
            Type.String({
              description: "Only return tags whose names contain this text.",
            }),
          ),
          attachedBy: Type.Optional(
            stringEnum(["ai", "human", "none"] as const, {
              description: "Filter tags by how they are attached to bookmarks.",
            }),
          ),
          sortBy: Type.Optional(
            stringEnum(["name", "usage", "relevance"] as const, {
              default: "usage",
              description:
                "How to sort tags. Relevance requires nameContains to be set.",
            }),
          ),
          limit: Type.Optional(
            Type.Integer({
              minimum: 1,
              maximum: 1000,
              default: 50,
              description: "The number of tags to return.",
            }),
          ),
          page: Type.Optional(
            Type.Integer({
              minimum: 0,
              default: 0,
              description:
                "The zero-based page number to fetch when using pagination.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = {
          sortBy: "usage" as const,
          limit: 50,
          page: 0,
          ...params,
        };
        const result = await tagsApi.list({
          ...input,
          cursor: { page: input.page },
        });
        return textToolResult(
          `${result.tags
            .map(
              (tag) => `Tag ID: ${tag.id}
Name: ${tag.name}
Bookmarks: ${tag.numBookmarks}
Human attachments: ${tag.numBookmarksByAttachedType.human ?? 0}
AI attachments: ${tag.numBookmarksByAttachedType.ai ?? 0}`,
            )
            .join("\n\n")}

Next page: ${result.nextCursor ? result.nextCursor.page : "no more pages"}`,
          result,
        );
      },
    }),
    tool({
      name: "create-tag",
      label: "Create tag",
      description: "Create a tag.",
      invalidates: [
        "bookmarks.getBookmark",
        "bookmarks.getBookmarks",
        "bookmarks.searchBookmarks",
        "tags.get",
        "tags.list",
        // Tag mutations can change tag-based smart-list membership and counts.
        "lists.getListsOfBookmark",
        "lists.stats",
      ],
      parameters: Type.Object(
        {
          name: Type.String({ description: "The tag name." }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const tag = await tagsApi.create(input);
        return textToolResult(`Tag ${tag.name} created with id ${tag.id}`, tag);
      },
    }),
    tool({
      name: "rename-tag",
      label: "Rename tag",
      description: "Rename a tag.",
      invalidates: [
        "bookmarks.getBookmark",
        "bookmarks.getBookmarks",
        "bookmarks.searchBookmarks",
        "tags.get",
        "tags.list",
        // Tag mutations can change tag-based smart-list membership and counts.
        "lists.getListsOfBookmark",
        "lists.stats",
      ],
      parameters: Type.Object(
        {
          tagId: Type.String({ description: "The tag id to rename." }),
          name: Type.String({ description: "The new tag name." }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const tag = await tagsApi.update(input);
        return textToolResult(`Tag ${tag.id} renamed to ${tag.name}`, tag);
      },
    }),
    tool({
      name: "merge-tags",
      label: "Merge tags",
      description:
        "Merge one or more source tags into a target tag. Only use this when the user explicitly asks to merge tags.",
      invalidates: [
        "bookmarks.getBookmark",
        "bookmarks.getBookmarks",
        "bookmarks.searchBookmarks",
        "tags.get",
        "tags.list",
        // Tag mutations can change tag-based smart-list membership and counts.
        "lists.getListsOfBookmark",
        "lists.stats",
      ],
      parameters: Type.Object(
        {
          intoTagId: Type.String({
            description: "The target tag id to merge into.",
          }),
          fromTagIds: Type.Array(Type.String(), {
            minItems: 1,
            description: "The source tag ids to merge from.",
          }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const result = await tagsApi.merge(input);
        return textToolResult(
          `Merged tags ${JSON.stringify(result.deletedTags)} into ${result.mergedIntoTagId}`,
          result,
        );
      },
    }),
    tool({
      name: "delete-tag",
      label: "Delete tag",
      description:
        "Delete a tag. Only use this when the user explicitly asks to delete a tag.",
      invalidates: [
        "bookmarks.getBookmark",
        "bookmarks.getBookmarks",
        "bookmarks.searchBookmarks",
        "tags.get",
        "tags.list",
        // Tag mutations can change tag-based smart-list membership and counts.
        "lists.getListsOfBookmark",
        "lists.stats",
      ],
      parameters: Type.Object(
        {
          tagId: Type.String({ description: "The tag id to delete." }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        await tagsApi.delete(input);
        return textToolResult(`Tag ${input.tagId} deleted`, input);
      },
    }),
    tool({
      name: "list-highlights",
      label: "List highlights",
      description:
        "List highlights, optionally scoped to a bookmark or searched by text.",
      parameters: Type.Object(
        {
          bookmarkId: Type.Optional(
            Type.String({
              description: "Only return highlights for this bookmark.",
            }),
          ),
          query: Type.Optional(
            Type.String({ description: "Search highlight text." }),
          ),
          limit: Type.Optional(
            Type.Integer({
              minimum: 1,
              maximum: 100,
              default: 20,
              description: "The number of highlights to return.",
            }),
          ),
          nextCursor: Type.Optional(
            Type.String({
              description:
                "The next cursor to use for pagination. The value for this is returned from a previous call to this tool.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = {
          limit: 20,
          ...params,
        };

        const result = input.bookmarkId
          ? await highlightsApi.getForBookmark({ bookmarkId: input.bookmarkId })
          : input.query
            ? await highlightsApi.search({
                text: input.query,
                limit: input.limit,
                cursor: parseCursorV2(input.nextCursor),
              })
            : await highlightsApi.getAll({
                limit: input.limit,
                cursor: parseCursorV2(input.nextCursor),
              });
        const nextCursor =
          "nextCursor" in result ? serializeCursor(result.nextCursor) : null;
        return textToolResult(
          `${result.highlights.map(compactHighlight).join("\n\n")}

Next cursor: ${nextCursor ?? "no more pages"}`,
          result,
        );
      },
    }),
    tool({
      name: "get-highlight",
      label: "Get highlight",
      description: "Get a highlight by id.",
      parameters: Type.Object(
        {
          highlightId: Type.String({ description: "The highlight id to get." }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const highlight = await highlightsApi.get(input);
        return textToolResult(compactHighlight(highlight), highlight);
      },
    }),
    tool({
      name: "update-highlight",
      label: "Update highlight",
      description: "Update a highlight's color or note.",
      invalidates: [
        "highlights.get",
        "highlights.getAll",
        "highlights.getForBookmark",
        "highlights.search",
      ],
      parameters: Type.Object(
        {
          highlightId: Type.String({
            description: "The highlight id to update.",
          }),
          color: Type.Optional(
            stringEnum(["yellow", "red", "green", "blue"] as const, {
              description: "The highlight color.",
            }),
          ),
          note: Type.Optional(
            nullableString(
              "The note to store on the highlight. Pass null to clear it.",
            ),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const highlight = await highlightsApi.update(input);
        return textToolResult(compactHighlight(highlight), highlight);
      },
    }),
    tool({
      name: "delete-highlight",
      label: "Delete highlight",
      description:
        "Delete a highlight. Only use this when the user explicitly asks to delete a highlight.",
      invalidates: [
        "highlights.get",
        "highlights.getAll",
        "highlights.getForBookmark",
        "highlights.search",
      ],
      parameters: Type.Object(
        {
          highlightId: Type.String({
            description: "The highlight id to delete.",
          }),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, params) {
        const input = params;
        const highlight = await highlightsApi.delete(input);
        return textToolResult(
          `Highlight ${input.highlightId} deleted`,
          highlight,
        );
      },
    }),
  ];

  return withChatToolUsageLogging(ctx, tools);
}
