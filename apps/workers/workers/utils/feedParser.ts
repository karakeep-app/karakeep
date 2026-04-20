import Parser from "rss-parser";
import { z } from "zod";

const parser = new Parser({
  customFields: {
    item: ["id"],
  },
});

const categorySchema = z
  .union([z.string(), z.object({ _: z.string() })])
  .transform((c) => (typeof c === "string" ? c : c._));

const optionalStringSchema = z.preprocess(
  (value) => (typeof value === "string" ? value : undefined),
  z.string().optional(),
);

const feedItemSchema = z
  .object({
    id: optionalStringSchema,
    link: z.string().optional(),
    guid: z.string().optional(),
    title: z.string().optional(),
    categories: z.array(categorySchema).optional(),
  })
  .transform((item) => ({
    ...item,
    guid: item.guid ?? item.id ?? item.link,
  }));

export type ParsedFeedItem = z.infer<typeof feedItemSchema>;

export async function parseFeedItems(
  xmlData: string,
): Promise<ParsedFeedItem[]> {
  const unparsedFeedData = await parser.parseString(xmlData);

  return unparsedFeedData.items
    .map((item) => feedItemSchema.safeParse(item))
    .flatMap((item) => (item.success ? [item.data] : []));
}
