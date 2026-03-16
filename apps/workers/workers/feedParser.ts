import Parser from "rss-parser";
import { z } from "zod";

const parser = new Parser({
  customFields: {
    item: ["id"],
  },
});

const categorySchema = z.union([
  z.string(),
  z.object({
    _: z.string(),
  }),
]);

const optionalStringSchema = z.preprocess(
  (value) => (typeof value === "string" ? value : undefined),
  z.string().optional(),
);

const feedItemSchema = z.object({
  id: optionalStringSchema,
  link: z.string().optional(),
  guid: z.string().optional(),
  title: z.string().optional(),
  categories: z.array(categorySchema).optional(),
});

export type ParsedFeedItem = Omit<
  z.infer<typeof feedItemSchema>,
  "categories"
> & {
  categories?: string[];
};

export async function parseFeedItems(
  xmlData: string,
): Promise<ParsedFeedItem[]> {
  const unparsedFeedData = await parser.parseString(xmlData);

  return unparsedFeedData.items
    .map((item) => feedItemSchema.safeParse(item))
    .flatMap((item) => (item.success ? [item.data] : []))
    .map((item) => ({
      ...item,
      categories: item.categories?.map((category) =>
        typeof category === "string" ? category : category._,
      ),
      guid: item.guid ?? item.id ?? item.link,
    }));
}
