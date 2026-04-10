import { count, eq } from "drizzle-orm";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import { rssFeedsTable } from "@karakeep/db/schema";
import {
  zNewFeedSchema,
  zUpdateFeedSchema,
} from "@karakeep/shared/types/feeds";

type Feed = typeof rssFeedsTable.$inferSelect;

export class FeedsRepo {
  constructor(private db: DB) {}

  async get(id: string): Promise<Feed | null> {
    const feed = await this.db.query.rssFeedsTable.findFirst({
      where: eq(rssFeedsTable.id, id),
    });
    return feed ?? null;
  }

  async create(
    userId: string,
    input: z.infer<typeof zNewFeedSchema>,
  ): Promise<Feed> {
    const [result] = await this.db
      .insert(rssFeedsTable)
      .values({
        name: input.name,
        url: input.url,
        userId,
        enabled: input.enabled,
        importTags: input.importTags ?? false,
      })
      .returning();

    return result;
  }

  async countByUser(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(rssFeedsTable)
      .where(eq(rssFeedsTable.userId, userId));
    return result.count;
  }

  async getAll(userId: string): Promise<Feed[]> {
    return await this.db.query.rssFeedsTable.findMany({
      where: eq(rssFeedsTable.userId, userId),
    });
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db
      .delete(rssFeedsTable)
      .where(eq(rssFeedsTable.id, id));
    return res.changes > 0;
  }

  async update(
    id: string,
    input: z.infer<typeof zUpdateFeedSchema>,
  ): Promise<Feed | null> {
    const result = await this.db
      .update(rssFeedsTable)
      .set({
        name: input.name,
        url: input.url,
        enabled: input.enabled,
        importTags: input.importTags,
      })
      .where(eq(rssFeedsTable.id, id))
      .returning();

    return result[0] ?? null;
  }
}
