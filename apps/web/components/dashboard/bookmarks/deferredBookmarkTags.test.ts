import { describe, expect, it, vi } from "vitest";

import type { ZBookmarkTags } from "@karakeep/shared/types/tags";

import {
  createEmptyDeferredTagChanges,
  persistBookmarkEdits,
  stageTagAttachment,
  stageTagDetachment,
} from "./deferredBookmarkTags";

const initialTags: ZBookmarkTags[] = [
  { id: "tag-1", name: "news", attachedBy: "human" },
];

describe("deferred bookmark tag changes", () => {
  it("cancels a pending attachment when the tag is removed", () => {
    const attached = stageTagAttachment(
      createEmptyDeferredTagChanges(),
      initialTags,
      { tagName: "later" },
    );
    expect(attached).toEqual({
      attach: [{ tagName: "later" }],
      detach: [],
    });

    const detached = stageTagDetachment(attached, initialTags, {
      tagId: "temp-1",
      tagName: "later",
    });

    expect(detached).toEqual(createEmptyDeferredTagChanges());
  });

  it("cancels a pending detachment when the original tag is restored", () => {
    const detached = stageTagDetachment(
      createEmptyDeferredTagChanges(),
      initialTags,
      { tagId: "tag-1", tagName: "news" },
    );
    expect(detached).toEqual({
      attach: [],
      detach: [{ tagId: "tag-1" }],
    });

    const restored = stageTagAttachment(detached, initialTags, {
      tagId: "tag-1",
      tagName: "news",
    });

    expect(restored).toEqual(createEmptyDeferredTagChanges());
  });

  it("saves details before applying tag changes", async () => {
    const events: string[] = [];
    const saveDetails = vi.fn(async () => {
      events.push("details");
      return { id: "bookmark-1" };
    });
    const saveTags = vi.fn(async () => {
      events.push("tags");
    });

    await persistBookmarkEdits({
      saveDetails,
      saveTags,
      tagChanges: {
        attach: [],
        detach: [{ tagId: "tag-1" }],
      },
    });

    expect(events).toEqual(["details", "tags"]);
  });

  it("does not apply tag changes when saving details fails", async () => {
    const error = new Error("details failed");
    const saveTags = vi.fn();

    await expect(
      persistBookmarkEdits({
        saveDetails: () => Promise.reject(error),
        saveTags,
        tagChanges: {
          attach: [],
          detach: [{ tagId: "tag-1" }],
        },
      }),
    ).rejects.toBe(error);

    expect(saveTags).not.toHaveBeenCalled();
  });

  it("skips the tag request when no tags changed", async () => {
    const saveTags = vi.fn();

    await persistBookmarkEdits({
      saveDetails: async () => ({ id: "bookmark-1" }),
      saveTags,
      tagChanges: createEmptyDeferredTagChanges(),
    });

    expect(saveTags).not.toHaveBeenCalled();
  });
});
