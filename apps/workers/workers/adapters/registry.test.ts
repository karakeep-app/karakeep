import { describe, expect, test } from "vitest";

import { findPlatformAdapter, platformAdapters } from "./registry";

describe("platform adapter registry", () => {
  test("matches WeChat article URLs", () => {
    expect(findPlatformAdapter("https://mp.weixin.qq.com/s/example")?.id).toBe(
      "wechat",
    );
    expect(
      findPlatformAdapter("https://mp.weixin.qq.com/s?__biz=test")?.id,
    ).toBe("wechat");
  });

  test("does not match generic URLs", () => {
    expect(findPlatformAdapter("https://example.com/s/example")).toBeNull();
  });

  test("keeps adapters sorted by priority", () => {
    const priorities = platformAdapters.map((adapter) => adapter.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });
});
