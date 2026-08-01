import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import { karakeepClient, mcpServer } from "./shared";
import { compactHighlight, pickDefined, toMcpToolError } from "./utils";

const highlightColorSchema = z.enum(["yellow", "red", "green", "blue"]);

export const listHighlightsInputSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(`Maximum number of highlights to return per page.`),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe(`Cursor from a previous response to fetch the next page.`),
};

export type ListHighlightsInput = z.infer<
  z.ZodObject<typeof listHighlightsInputSchema>
>;

export async function listHighlightsHandler(
  input: ListHighlightsInput,
): Promise<CallToolResult> {
  const res = await karakeepClient.GET("/highlights", {
    params: { query: pickDefined(input) },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  const cursorLine = res.data.nextCursor
    ? `\n\nNext page cursor: ${res.data.nextCursor}`
    : "";
  const highlights =
    res.data.highlights.length > 0
      ? res.data.highlights.map(compactHighlight).join("\n\n")
      : "No highlights found.";
  return {
    content: [{ type: "text", text: highlights + cursorLine }],
  };
}

mcpServer.tool(
  "list-highlights",
  `List highlights across all bookmarks, newest first.`,
  listHighlightsInputSchema,
  { readOnlyHint: true },
  listHighlightsHandler,
);

export const getBookmarkHighlightsInputSchema = {
  bookmarkId: z
    .string()
    .min(1)
    .describe(`The id of the bookmark whose highlights to retrieve.`),
};

export async function getBookmarkHighlightsHandler({
  bookmarkId,
}: {
  bookmarkId: string;
}): Promise<CallToolResult> {
  const res = await karakeepClient.GET("/bookmarks/{bookmarkId}/highlights", {
    params: { path: { bookmarkId } },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return {
    content: [
      {
        type: "text",
        text:
          res.data.highlights.length > 0
            ? res.data.highlights.map(compactHighlight).join("\n\n")
            : "No highlights found for this bookmark.",
      },
    ],
  };
}

mcpServer.tool(
  "get-bookmark-highlights",
  `List every highlight on a bookmark.`,
  getBookmarkHighlightsInputSchema,
  { readOnlyHint: true },
  getBookmarkHighlightsHandler,
);

export const getHighlightInputSchema = {
  highlightId: z
    .string()
    .min(1)
    .describe(`The id of the highlight to retrieve.`),
};

export async function getHighlightHandler({
  highlightId,
}: {
  highlightId: string;
}): Promise<CallToolResult> {
  const res = await karakeepClient.GET("/highlights/{highlightId}", {
    params: { path: { highlightId } },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return {
    content: [{ type: "text", text: compactHighlight(res.data) }],
  };
}

mcpServer.tool(
  "get-highlight",
  `Retrieve a single highlight by id.`,
  getHighlightInputSchema,
  { readOnlyHint: true },
  getHighlightHandler,
);

export const createHighlightInputSchema = {
  bookmarkId: z
    .string()
    .min(1)
    .describe(`The id of the bookmark to highlight.`),
  startOffset: z
    .number()
    .int()
    .min(0)
    .describe(`Zero-based inclusive character offset.`),
  endOffset: z
    .number()
    .int()
    .min(0)
    .describe(`Zero-based exclusive character offset.`),
  color: highlightColorSchema
    .optional()
    .describe(`Highlight color. Defaults to yellow.`),
  text: z
    .string()
    .nullable()
    .describe(`The highlighted text, or null if unavailable.`),
  note: z
    .string()
    .nullable()
    .describe(`An optional note attached to the highlight.`),
};

export type CreateHighlightInput = z.infer<
  z.ZodObject<typeof createHighlightInputSchema>
>;

export async function createHighlightHandler(
  input: CreateHighlightInput,
): Promise<CallToolResult> {
  if (input.endOffset <= input.startOffset) {
    return toMcpToolError(`endOffset must be greater than startOffset.`);
  }
  const res = await karakeepClient.POST("/highlights", {
    body: input,
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return {
    content: [{ type: "text", text: compactHighlight(res.data) }],
  };
}

mcpServer.tool(
  "create-highlight",
  `Create a text highlight on a bookmark using character offsets from the bookmark's readable content.`,
  createHighlightInputSchema,
  { readOnlyHint: false, destructiveHint: false },
  createHighlightHandler,
);

export const updateHighlightInputSchema = {
  highlightId: z.string().min(1).describe(`The id of the highlight to update.`),
  color: highlightColorSchema.optional().describe(`New highlight color.`),
  note: z
    .string()
    .nullable()
    .optional()
    .describe(`New note. Pass null to clear it.`),
};

export type UpdateHighlightInput = z.infer<
  z.ZodObject<typeof updateHighlightInputSchema>
>;

export async function updateHighlightHandler(
  input: UpdateHighlightInput,
): Promise<CallToolResult> {
  const { highlightId, ...fields } = input;
  const body = pickDefined(fields);
  if (Object.keys(body).length === 0) {
    return toMcpToolError(
      `update-highlight requires at least one field to update (color or note).`,
    );
  }
  const res = await karakeepClient.PATCH("/highlights/{highlightId}", {
    params: { path: { highlightId } },
    body,
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return {
    content: [{ type: "text", text: compactHighlight(res.data) }],
  };
}

mcpServer.tool(
  "update-highlight",
  `Update a highlight's color or note.`,
  updateHighlightInputSchema,
  { readOnlyHint: false, destructiveHint: false },
  updateHighlightHandler,
);

export const deleteHighlightInputSchema = {
  highlightId: z.string().min(1).describe(`The id of the highlight to delete.`),
};

export async function deleteHighlightHandler({
  highlightId,
}: {
  highlightId: string;
}): Promise<CallToolResult> {
  const res = await karakeepClient.DELETE("/highlights/{highlightId}", {
    params: { path: { highlightId } },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return {
    content: [
      {
        type: "text",
        text: `Deleted highlight ${res.data.id} from bookmark ${res.data.bookmarkId}.`,
      },
    ],
  };
}

mcpServer.tool(
  "delete-highlight",
  `Delete a highlight by id.`,
  deleteHighlightInputSchema,
  { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  deleteHighlightHandler,
);
