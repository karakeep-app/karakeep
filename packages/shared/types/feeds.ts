import { z } from "zod";

const MAX_FEED_URL_LENGTH = 500;
const MAX_FEED_NAME_LENGTH = 100;

export const zAppliesToEnumSchema = z.enum(["all", "text", "images"]);

export const zFeedSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(MAX_FEED_NAME_LENGTH),
  url: z.string().url(),
  enabled: z.boolean(),
  importTags: z.boolean(),
  lastFetchedStatus: z.enum(["success", "failure", "pending"]).nullable(),
  lastFetchedAt: z.date().nullable(),
});

export type ZFeed = z.infer<typeof zFeedSchema>;

export const zNewFeedSchema = z.object({
  name: z.string().min(1).max(MAX_FEED_NAME_LENGTH),
  url: z.string().max(MAX_FEED_URL_LENGTH).url(),
  enabled: z.boolean(),
  importTags: z.boolean().optional().default(false),
});

export const zUpdateFeedSchema = z.object({
  feedId: z.string(),
  name: z.string().min(1).max(MAX_FEED_NAME_LENGTH).optional(),
  url: z.string().max(MAX_FEED_URL_LENGTH).url().optional(),
  enabled: z.boolean().optional(),
  importTags: z.boolean().optional(),
});
