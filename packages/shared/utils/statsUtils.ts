import { z } from "zod";
import { zBookmarkSourceSchema } from "../types/bookmarks";

export type BookmarkSource = z.infer<typeof zBookmarkSourceSchema>;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

export const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const hourLabels = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`,
);

export function formatSourceName(source: BookmarkSource | null): string {
  if (!source) return "Unknown";
  const sourceMap: Record<BookmarkSource, string> = {
    api: "API",
    web: "Web",
    extension: "Browser Extension",
    cli: "CLI",
    mobile: "Mobile App",
    singlefile: "SingleFile",
    rss: "RSS Feed",
    import: "Import",
  };
  return sourceMap[source];
}
