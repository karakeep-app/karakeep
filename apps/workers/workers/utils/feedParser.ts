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

// rss-parser normalizes both the RSS `<pubDate>` and the Atom
// `<updated>`/`<published>` elements into `isoDate`, so we prefer it and fall
// back to the raw `pubDate` when the normalized value is missing.
function parseFeedDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

const feedItemSchema = z
  .object({
    id: optionalStringSchema,
    link: z.string().optional(),
    guid: z.string().optional(),
    title: z.string().optional(),
    categories: z.array(categorySchema).optional(),
    isoDate: optionalStringSchema,
    pubDate: optionalStringSchema,
  })
  .transform((item) => ({
    ...item,
    guid: item.guid ?? item.id ?? item.link,
    publishedAt: parseFeedDate(item.isoDate ?? item.pubDate),
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
