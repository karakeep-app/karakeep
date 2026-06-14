import { describe, expect, test } from "vitest";

import { BookmarkTypes, ZBookmark } from "../types/bookmarks";
import {
  isBookmarkStillDownloadingVideo,
  isBookmarkStillLoading,
  resolveShouldCaptureVideo,
} from "./bookmarkUtils";

function makeLinkBookmark(overrides: {
  crawlStatus?: "pending" | "success" | "failure";
  crawledAt?: Date | null;
  videoDownloadStatus?:
    | "pending"
    | "downloading"
    | "success"
    | "failure"
    | null;
  taggingStatus?: "pending" | "success" | "failure";
  summarizationStatus?: "pending" | "success" | "failure";
}): ZBookmark {
  return {
    id: "bm1",
    createdAt: new Date(),
    modifiedAt: null,
    title: null,
    archived: false,
    favourited: false,
    captureVideo: null,
    taggingStatus: overrides.taggingStatus ?? "success",
    summarizationStatus: overrides.summarizationStatus ?? "success",
    embeddingStatus: "success",
    note: null,
    summary: null,
    userId: "u1",
    tags: [],
    assets: [],
    content: {
      type: BookmarkTypes.LINK,
      url: "https://example.com",
      crawlStatus: overrides.crawlStatus ?? "success",
      crawledAt: overrides.crawledAt ?? new Date(),
      videoDownloadStatus: overrides.videoDownloadStatus ?? null,
    },
  } as ZBookmark;
}

describe("resolveShouldCaptureVideo", () => {
  test("force-on overrides a disabled server default", () => {
    expect(resolveShouldCaptureVideo(true, false)).toBe(true);
  });

  test("force-off overrides an enabled server default", () => {
    expect(resolveShouldCaptureVideo(false, true)).toBe(false);
  });

  test("null inherits the enabled server default", () => {
    expect(resolveShouldCaptureVideo(null, true)).toBe(true);
  });

  test("null inherits the disabled server default", () => {
    expect(resolveShouldCaptureVideo(null, false)).toBe(false);
  });

  test("undefined inherits the server default", () => {
    expect(resolveShouldCaptureVideo(undefined, true)).toBe(true);
  });
});

describe("isBookmarkStillDownloadingVideo", () => {
  test("true while pending", () => {
    expect(
      isBookmarkStillDownloadingVideo(
        makeLinkBookmark({ videoDownloadStatus: "pending" }),
      ),
    ).toBe(true);
  });

  test("true while downloading", () => {
    expect(
      isBookmarkStillDownloadingVideo(
        makeLinkBookmark({ videoDownloadStatus: "downloading" }),
      ),
    ).toBe(true);
  });

  test("false when finished, failed, or never attempted", () => {
    expect(
      isBookmarkStillDownloadingVideo(
        makeLinkBookmark({ videoDownloadStatus: "success" }),
      ),
    ).toBe(false);
    expect(
      isBookmarkStillDownloadingVideo(
        makeLinkBookmark({ videoDownloadStatus: "failure" }),
      ),
    ).toBe(false);
    expect(
      isBookmarkStillDownloadingVideo(
        makeLinkBookmark({ videoDownloadStatus: null }),
      ),
    ).toBe(false);
  });
});

describe("isBookmarkStillLoading includes video downloads", () => {
  test("still loading while a video is downloading even if everything else is done", () => {
    const bookmark = makeLinkBookmark({
      crawlStatus: "success",
      taggingStatus: "success",
      summarizationStatus: "success",
      videoDownloadStatus: "downloading",
    });
    expect(isBookmarkStillLoading(bookmark)).toBe(true);
  });

  test("not loading once the video download has finished", () => {
    const bookmark = makeLinkBookmark({
      crawlStatus: "success",
      taggingStatus: "success",
      summarizationStatus: "success",
      videoDownloadStatus: "success",
    });
    expect(isBookmarkStillLoading(bookmark)).toBe(false);
  });
});
