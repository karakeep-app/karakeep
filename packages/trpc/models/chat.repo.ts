import { and, asc, desc, eq } from "drizzle-orm";

import type { DB } from "@karakeep/db";
import { chatMessages, chatSessions } from "@karakeep/db/schema";

export type ChatSessionRow = typeof chatSessions.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;

export class ChatRepo {
  constructor(private db: DB) {}

  async listSessions(userId: string): Promise<ChatSessionRow[]> {
    return this.db.query.chatSessions.findMany({
      where: eq(chatSessions.userId, userId),
      orderBy: [
        desc(chatSessions.modifiedAt),
        desc(chatSessions.createdAt),
        desc(chatSessions.id),
      ],
    });
  }

  async createSession(input: {
    userId: string;
    title: string;
    createdAt: Date;
    modifiedAt: Date;
  }): Promise<ChatSessionRow | null> {
    const [chat] = await this.db.insert(chatSessions).values(input).returning();

    return chat ?? null;
  }

  async getSessionForUser(
    userId: string,
    chatId: string,
  ): Promise<ChatSessionRow | null> {
    const chat = await this.db.query.chatSessions.findFirst({
      where: and(eq(chatSessions.id, chatId), eq(chatSessions.userId, userId)),
    });

    return chat ?? null;
  }

  async updateSessionModifiedAt(
    chatId: string,
    modifiedAt: Date,
  ): Promise<ChatSessionRow | null> {
    const [chat] = await this.db
      .update(chatSessions)
      .set({ modifiedAt })
      .where(eq(chatSessions.id, chatId))
      .returning();

    return chat ?? null;
  }

  async deleteSessionForUser(userId: string, chatId: string): Promise<void> {
    await this.db
      .delete(chatSessions)
      .where(and(eq(chatSessions.id, chatId), eq(chatSessions.userId, userId)));
  }

  async deleteAllSessionsForUser(userId: string): Promise<void> {
    await this.db.delete(chatSessions).where(eq(chatSessions.userId, userId));
  }

  async listMessages(chatId: string): Promise<ChatMessageRow[]> {
    return this.db.query.chatMessages.findMany({
      where: eq(chatMessages.chatId, chatId),
      orderBy: [asc(chatMessages.createdAt), asc(chatMessages.id)],
    });
  }

  async createUserMessage(input: {
    chatId: string;
    content: string;
    createdAt: Date;
  }): Promise<ChatMessageRow | null> {
    const [message] = await this.db
      .insert(chatMessages)
      .values({
        chatId: input.chatId,
        role: "user",
        content: input.content,
        createdAt: input.createdAt,
      })
      .returning();

    return message ?? null;
  }

  async createAgentMessage(input: {
    chatId: string;
    role: "assistant" | "toolResult";
    content: string;
    metadata: unknown;
    createdAt: Date;
  }): Promise<ChatMessageRow | null> {
    const [message] = await this.db
      .insert(chatMessages)
      .values({
        chatId: input.chatId,
        role: input.role,
        content: input.content,
        metadata: input.metadata,
        createdAt: input.createdAt,
      })
      .returning();

    return message ?? null;
  }
}
