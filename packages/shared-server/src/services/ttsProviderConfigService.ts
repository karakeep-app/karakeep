import { eq } from "drizzle-orm";

import type { DB } from "@karakeep/db";
import { ttsProviderConfig } from "@karakeep/db/schema";

export interface TtsProviderConfig {
  provider: "openai-compatible";
  baseUrl: string;
  apiKey: string | null;
  model: string;
  voice: string;
}

export class TtsProviderConfigService {
  static async get(db: DB, userId: string): Promise<TtsProviderConfig | null> {
    const row = await db.query.ttsProviderConfig.findFirst({
      where: eq(ttsProviderConfig.userId, userId),
    });
    return row ?? null;
  }

  // apiKey undefined/empty keeps whatever key (if any) is already stored, so
  // the settings form never needs to display or resubmit the existing secret.
  static async set(
    db: DB,
    userId: string,
    input: {
      provider: "openai-compatible";
      baseUrl: string;
      apiKey?: string;
      model: string;
      voice: string;
    },
  ): Promise<void> {
    const existing = await this.get(db, userId);
    const apiKey = input.apiKey ? input.apiKey : (existing?.apiKey ?? null);

    await db
      .insert(ttsProviderConfig)
      .values({
        userId,
        provider: input.provider,
        baseUrl: input.baseUrl,
        apiKey,
        model: input.model,
        voice: input.voice,
      })
      .onConflictDoUpdate({
        target: ttsProviderConfig.userId,
        set: {
          provider: input.provider,
          baseUrl: input.baseUrl,
          apiKey,
          model: input.model,
          voice: input.voice,
        },
      });
  }
}
