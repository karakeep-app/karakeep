import { z } from "zod";

const MAX_WEBHOOK_URL_LENGTH = 500;
const MAX_WEBHOOK_TOKEN_LENGTH = 100;

export const zWebhookEventSchema = z.enum([
  "created",
  "edited",
  "crawled",
  "ai tagged",
  "deleted",
]);
export type ZWebhookEvent = z.infer<typeof zWebhookEventSchema>;

export const zWebhookSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  events: z.array(zWebhookEventSchema),
  hasToken: z.boolean(),
  createdAt: z.date(),
});

export type ZWebhook = z.infer<typeof zWebhookSchema>;

export const zNewWebhookSchema = z.object({
  url: z.string().max(MAX_WEBHOOK_URL_LENGTH).url(),
  events: z.array(zWebhookEventSchema).min(1),
  token: z.string().max(MAX_WEBHOOK_TOKEN_LENGTH).optional(),
});

export const zUpdateWebhookSchema = z.object({
  webhookId: z.string(),
  url: z.string().max(MAX_WEBHOOK_URL_LENGTH).url().optional(),
  events: z.array(zWebhookEventSchema).min(1).optional(),
  token: z.string().max(MAX_WEBHOOK_TOKEN_LENGTH).nullish(),
});
