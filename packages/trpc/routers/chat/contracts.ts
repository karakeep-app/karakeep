import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { z } from "zod";

export type StoredPiMessage = Extract<
  AgentMessage,
  { role: "assistant" | "toolResult" }
>;

export const publicToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});
export type PublicToolCall = z.infer<typeof publicToolCallSchema>;

export const publicToolResultSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  isError: z.boolean(),
  error: z.string().optional(),
});

export const cacheInvalidationHandleSchema = z.enum([
  "bookmarks.getBookmark",
  "bookmarks.getBookmarks",
  "bookmarks.searchBookmarks",
  "highlights.get",
  "highlights.getAll",
  "highlights.getForBookmark",
  "highlights.search",
  "lists.get",
  "lists.getListsOfBookmark",
  "lists.list",
  "lists.stats",
  "tags.get",
  "tags.list",
]);
export type CacheInvalidationHandle = z.infer<
  typeof cacheInvalidationHandleSchema
>;

export const toolUpdateDetailsSchema = z.object({
  cacheInvalidation: z
    .object({
      trpcHandles: z.array(cacheInvalidationHandleSchema),
    })
    .optional(),
});

export const chatSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.date(),
  modifiedAt: z.date().nullable(),
});

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "toolResult"]),
  content: z.string(),
  toolCalls: z.array(publicToolCallSchema).optional(),
  toolResult: publicToolResultSchema.optional(),
  createdAt: z.date(),
});

export const piMessageMetadataSchema = z.custom<StoredPiMessage>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "role" in value &&
    (value.role === "assistant" || value.role === "toolResult"),
);

export type ChatStreamEvent =
  | {
      type: "chat";
      chat: z.infer<typeof chatSessionSchema>;
    }
  | {
      type: "message";
      message: z.infer<typeof chatMessageSchema>;
    }
  | {
      type: "message_update";
      message: Pick<
        z.infer<typeof chatMessageSchema>,
        "role" | "content" | "toolCalls"
      >;
    }
  | {
      type: "tool_execution_start";
      toolCall: {
        id: string;
        name: string;
      };
    }
  | {
      type: "tool_execution_end";
      toolCall: {
        id: string;
        name: string;
        isError: boolean;
        error?: string;
      };
    }
  | {
      type: "cache_invalidation";
      trpcHandles: CacheInvalidationHandle[];
    };

export type PendingPersistedAgentMessage =
  | {
      role: "assistant";
      content: string;
      metadata: Extract<StoredPiMessage, { role: "assistant" }>;
    }
  | {
      role: "toolResult";
      content: string;
      metadata: Extract<StoredPiMessage, { role: "toolResult" }>;
    };
