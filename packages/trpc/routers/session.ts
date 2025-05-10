import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import { db } from "@karakeep/db";
import { crawlSessions } from "@karakeep/db/schema";

import { authedProcedure, Context, router } from "../index";

export async function startSession(userId: string, name?: string) {
  const sessionId = uuidv4();
  await db.insert(crawlSessions).values({
    id: sessionId,
    name: name ?? `session-${Date.now()}`,
    userId: userId,
    startedAt: Date.now(),
    endedAt: 0,
  });
  return { id: sessionId };
}

export const sessionRouter = router({
  start: authedProcedure
    .input(z.object({ name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new Error("User not authenticated");
      }
      return startSession(ctx.user.id, input.name);
    }),
});

export const startSessionDirect = startSession;

export async function getCrawlSession(ctx: Context): Promise<string> {
  if (!ctx.user) {
    throw new Error("User not authenticated");
  }

  const id = uuidv4();
  await ctx.db.insert(crawlSessions).values({
    id,
    name: `crawl-${Date.now()}`,
    userId: ctx.user.id,
    startedAt: Date.now(),
    endedAt: 0,
  });
  return id;
}
