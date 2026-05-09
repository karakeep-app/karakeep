import { wechatAdapter } from "./wechat";

import type { PlatformAdapter } from "./types";

export const platformAdapters: PlatformAdapter[] = [wechatAdapter].sort(
  (a, b) => b.priority - a.priority,
);

export function findPlatformAdapter(url: string): PlatformAdapter | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  return platformAdapters.find((adapter) => adapter.match(parsed)) ?? null;
}
