import type {
  AgentMessage,
  AgentToolResult,
} from "@mariozechner/pi-agent-core";
import { TRPCError } from "@trpc/server";

import type { ChatMessageRow, ChatSessionRow } from "../../models/chat.repo";
import { piMessageMetadataSchema } from "./contracts";
import type {
  PendingPersistedAgentMessage,
  PublicToolCall,
  StoredPiMessage,
} from "./contracts";
import { chatModel, emptyUsage } from "./model";

export function requireMutationResult<T>(value: T | null, message: string): T {
  if (!value) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message,
    });
  }

  return value;
}

export function requireChatSession(value: ChatSessionRow | null) {
  if (!value) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Chat not found",
    });
  }

  return value;
}

export function toPublicChatSession(chat: ChatSessionRow) {
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    modifiedAt: chat.modifiedAt,
  };
}

function parseMessageMetadata(message: ChatMessageRow) {
  if (message.metadata === null) {
    if (message.role === "toolResult") {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Stored tool result message is missing metadata",
      });
    }
    return null;
  }

  const result = piMessageMetadataSchema.safeParse(message.metadata);
  if (!result.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored chat message is invalid",
      cause: result.error,
    });
  }
  if (result.data.role !== message.role) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored chat message metadata does not match message role",
    });
  }
  return result.data;
}

export function getTextContent(
  content: Extract<StoredPiMessage, { role: "toolResult" }>["content"],
) {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
}

export function getToolResultText(
  result: Pick<AgentToolResult<unknown>, "content">,
) {
  return result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return String(error);
}

export function toChatTRPCError(error: unknown) {
  if (error instanceof TRPCError) {
    return error;
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: getErrorMessage(error),
    cause: error,
  });
}

function getPublicToolCalls(metadata: StoredPiMessage | null) {
  if (metadata?.role !== "assistant") {
    return undefined;
  }

  // Assistant content may be a plain string (no tool calls) and stored metadata
  // is only loosely validated, so guard before treating it as a content array.
  if (!Array.isArray(metadata.content)) {
    return undefined;
  }

  const toolCalls = metadata.content
    .filter((item) => item.type === "toolCall")
    .map(
      (toolCall): PublicToolCall => ({
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
      }),
    );

  return toolCalls.length > 0 ? toolCalls : undefined;
}

function getPublicToolResult(metadata: StoredPiMessage | null) {
  if (metadata?.role !== "toolResult") {
    return undefined;
  }

  return {
    toolCallId: metadata.toolCallId,
    toolName: metadata.toolName,
    isError: metadata.isError === true,
    error:
      metadata.isError === true ? getTextContent(metadata.content) : undefined,
  };
}

export function toPublicMessage(message: ChatMessageRow) {
  const metadata = parseMessageMetadata(message);

  return {
    id: message.id,
    role: message.role,
    content: message.content,
    toolCalls: getPublicToolCalls(metadata),
    toolResult: getPublicToolResult(metadata),
    createdAt: message.createdAt,
  };
}

/**
 * Drops assistant tool calls that have no matching tool result before the
 * transcript is replayed to the model. A turn that was aborted (e.g. the client
 * disconnected mid tool execution) can leave an assistant message with tool
 * calls whose results were never persisted; replaying that as-is makes the
 * provider reject every subsequent request and bricks the chat.
 */
export function sanitizeAgentMessagesForReplay(
  messages: AgentMessage[],
): AgentMessage[] {
  const resolvedToolCallIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "toolResult") {
      resolvedToolCallIds.add(message.toolCallId);
    }
  }

  const sanitized: AgentMessage[] = [];
  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.content === "string") {
      sanitized.push(message);
      continue;
    }

    const content = message.content.filter(
      (item) => item.type !== "toolCall" || resolvedToolCallIds.has(item.id),
    );

    if (content.length === 0) {
      continue;
    }

    sanitized.push({ ...message, content });
  }

  return sanitized;
}

export function toAgentMessage(message: ChatMessageRow): AgentMessage {
  if (message.role === "user") {
    return {
      role: "user",
      content: message.content,
      timestamp: message.createdAt.getTime(),
    };
  }

  const metadata = parseMessageMetadata(message);
  if (metadata) {
    return {
      ...metadata,
      timestamp: message.createdAt.getTime(),
    };
  }

  return {
    role: "assistant",
    content: [{ type: "text", text: message.content }],
    api: chatModel.api,
    provider: chatModel.provider,
    model: chatModel.id,
    usage: emptyUsage,
    stopReason: "stop",
    timestamp: message.createdAt.getTime(),
  };
}

export function getAgentMessageText(message: AgentMessage) {
  if (message.role !== "assistant") {
    return "";
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("");
}

export function toPersistedAgentMessage(
  message: AgentMessage,
): PendingPersistedAgentMessage | null {
  if (message.role === "assistant") {
    return {
      role: "assistant" as const,
      content: getAgentMessageText(message),
      metadata: message,
    };
  }

  if (message.role === "toolResult") {
    return {
      role: "toolResult" as const,
      content: getTextContent(message.content),
      metadata: message,
    };
  }

  return null;
}
