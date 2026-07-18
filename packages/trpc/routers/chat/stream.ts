import { Agent } from "@mariozechner/pi-agent-core";
import { TRPCError } from "@trpc/server";

import { logEvent } from "@karakeep/shared-server";
import type { AuthedContext } from "../../index";
import { ChatRepo } from "../../models/chat.repo";
import { createAsyncQueue } from "./asyncQueue";
import { toolUpdateDetailsSchema } from "./contracts";
import type { ChatStreamEvent } from "./contracts";
import { addUsage, chatModel, emptyUsage, getChatApiKey } from "./model";
import {
  getAgentMessageText,
  getToolResultText,
  requireMutationResult,
  requireChatSession,
  sanitizeAgentMessagesForReplay,
  toAgentMessage,
  toChatTRPCError,
  toPersistedAgentMessage,
  toPublicChatSession,
  toPublicMessage,
} from "./messages";
import { createChatTools } from "./tools";

interface ChatMessageInput {
  chatId?: string;
  message: string;
}

type AgentEvent = Parameters<Parameters<Agent["subscribe"]>[0]>[0];
type QueuedEvent = AgentEvent | { type: "prompt_error"; error: unknown };

function getChatTitle(message: string) {
  return message.slice(0, 80);
}

export async function* streamChatMessage(
  ctx: AuthedContext,
  input: ChatMessageInput,
): AsyncGenerator<ChatStreamEvent> {
  const repo = new ChatRepo(ctx.db);
  let nextCreatedAt = Date.now();
  const getNextCreatedAt = () => new Date(nextCreatedAt++);
  const modifiedAt = getNextCreatedAt();

  let chat;
  if (input.chatId) {
    const existingChat = requireChatSession(
      await repo.getSessionForUser(ctx.user.id, input.chatId),
    );
    chat = requireMutationResult(
      await repo.updateSessionModifiedAt(existingChat.id, modifiedAt),
      "Failed to update chat",
    );
  } else {
    chat = requireMutationResult(
      await repo.createSession({
        userId: ctx.user.id,
        title: getChatTitle(input.message),
        createdAt: modifiedAt,
        modifiedAt,
      }),
      "Failed to create chat",
    );
  }

  yield { type: "chat", chat: toPublicChatSession(chat) };

  const userMessage = requireMutationResult(
    await repo.createUserMessage({
      chatId: chat.id,
      content: input.message,
      createdAt: getNextCreatedAt(),
    }),
    "Failed to create chat message",
  );

  yield { type: "message", message: toPublicMessage(userMessage) };

  const persistedMessages = await repo.listMessages(chat.id);
  const previousMessages = persistedMessages.filter(
    (message) => message.id !== userMessage.id,
  );

  const agent = new Agent({
    initialState: {
      systemPrompt:
        "You are a helpful assistant. Use the available tools when you need information about the user's saved bookmarks or when the user asks you to organize, update, or delete their saved data.",
      model: chatModel,
      tools: createChatTools(ctx),
      messages: sanitizeAgentMessagesForReplay(
        previousMessages.map(toAgentMessage),
      ),
    },
    getApiKey: getChatApiKey,
  });

  const events = createAsyncQueue<QueuedEvent>();
  let chatUsage = emptyUsage;
  let toolCallCount = 0;

  agent.subscribe((event) => {
    events.push(event);
  });

  const promptResult = agent.prompt(input.message).then(
    () => null,
    (error: unknown) => {
      events.push({ type: "prompt_error", error });
      events.close();
      return error;
    },
  );

  try {
    for await (const event of events) {
      if (event.type === "prompt_error") {
        throw toChatTRPCError(event.error);
      }

      if (event.type === "agent_end") {
        break;
      }

      if (event.type === "message_update") {
        if (event.message.role === "assistant") {
          const toolCalls = event.message.content
            .filter((item) => item.type === "toolCall")
            .map((toolCall) => ({
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments,
            }));
          yield {
            type: "message_update",
            message: {
              role: "assistant",
              content: getAgentMessageText(event.message),
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            },
          };
        }
        continue;
      }

      if (event.type === "tool_execution_start") {
        toolCallCount += 1;
        yield {
          type: "tool_execution_start",
          toolCall: { id: event.toolCallId, name: event.toolName },
        };
        continue;
      }

      if (event.type === "tool_execution_end") {
        yield {
          type: "tool_execution_end",
          toolCall: {
            id: event.toolCallId,
            name: event.toolName,
            isError: event.isError,
            error: event.isError ? getToolResultText(event.result) : undefined,
          },
        };
        continue;
      }

      if (event.type === "tool_execution_update") {
        const details = toolUpdateDetailsSchema.safeParse(
          event.partialResult.details,
        );
        const trpcHandles = details.success
          ? details.data.cacheInvalidation?.trpcHandles
          : undefined;
        if (trpcHandles && trpcHandles.length > 0) {
          yield { type: "cache_invalidation", trpcHandles };
        }
        continue;
      }

      if (event.type !== "message_end") {
        continue;
      }

      if (event.message.role === "assistant") {
        chatUsage = addUsage(chatUsage, event.message.usage);
        if (
          event.message.stopReason === "error" ||
          event.message.stopReason === "aborted"
        ) {
          throw toChatTRPCError(
            new Error(event.message.errorMessage ?? "Chat model run failed"),
          );
        }
      }

      const message = toPersistedAgentMessage(event.message);
      if (!message) {
        continue;
      }

      const createdMessage = await repo.createAgentMessage({
        chatId: chat.id,
        role: message.role,
        content: message.content,
        metadata: message.metadata,
        createdAt: getNextCreatedAt(),
      });
      if (!createdMessage) {
        // The chat may have been deleted while the turn was still streaming.
        // Stop gracefully (the finally block aborts the agent) instead of
        // surfacing an INTERNAL_SERVER_ERROR for an expected race.
        if (!(await repo.getSessionForUser(ctx.user.id, chat.id))) {
          return;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create chat message",
        });
      }
      yield {
        type: "message",
        message: toPublicMessage(createdMessage),
      };

      const updatedSession = await repo.updateSessionModifiedAt(
        chat.id,
        getNextCreatedAt(),
      );
      if (!updatedSession) {
        if (!(await repo.getSessionForUser(ctx.user.id, chat.id))) {
          return;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update chat",
        });
      }

      yield {
        type: "chat",
        chat: toPublicChatSession(updatedSession),
      };
    }

    const promptError = await promptResult;
    if (promptError) {
      throw toChatTRPCError(promptError);
    }
    logEvent({
      "event.name": "chat.message",
      "user.id": ctx.user.id,
      "chat.id": chat.id,
      "chat.model": chatModel.id,
      "chat.provider": chatModel.provider,
      "chat.input_tokens": chatUsage.input,
      "chat.output_tokens": chatUsage.output,
      "chat.cache_read_tokens": chatUsage.cacheRead,
      "chat.cache_write_tokens": chatUsage.cacheWrite,
      "chat.total_tokens": chatUsage.totalTokens,
      "chat.cost": chatUsage.cost.total,
      "chat.tool_calls": toolCallCount,
    });
  } finally {
    // On client disconnect tRPC calls generator.return(), which runs only this
    // finally block. Abort the agent so it stops calling the model and stops
    // executing (possibly destructive) tools once nobody is consuming the stream.
    agent.abort();
    events.close();
  }
}
