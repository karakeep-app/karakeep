import { z } from "zod";

export const USER_LOCAL_SETTINGS_COOKIE_NAME = "hoarder-user-local-settings";

const zBookmarkGridLayout = z.enum(["grid", "list", "masonry", "compact"]);
export type BookmarksLayoutTypes = z.infer<typeof zBookmarkGridLayout>;

const zImageFit = z.enum(["cover", "contain"]);
export type ImageFitTypes = z.infer<typeof zImageFit>;

export const zUserLocalSettings = z.object({
  bookmarkGridLayout: zBookmarkGridLayout.optional().default("masonry"),
  lang: z.string().optional().default("en"),
  gridColumns: z.number().min(1).max(6).optional().default(3),
  showImages: z.boolean().optional().default(true),
  showText: z.boolean().optional().default(true),
  showTags: z.boolean().optional().default(true),
  restrictCardHeight: z.boolean().optional().default(true),
  imageFit: zImageFit.optional().default("cover"),
});

export type UserLocalSettings = z.infer<typeof zUserLocalSettings>;

export function parseUserLocalSettings(str: string | undefined) {
  try {
    return zUserLocalSettings.parse(JSON.parse(str ?? "{}"));
  } catch {
    return undefined;
  }
}

export function defaultUserLocalSettings() {
  return zUserLocalSettings.parse({});
}
