import {
  BookmarkTypes,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";

import { clearBadgeStatus } from "../utils/badgeCache";
import { getPluginSettings } from "../utils/settings";
import type { Settings } from "../utils/settings";
import {
  capturePageWithSingleFile,
  uploadSingleFileAsset,
  withTimeout,
} from "../utils/singlefile";
import { createApiClient } from "../utils/trpc";
import { isHttpUrl } from "../utils/url";
import { saveJobKey } from "./save-protocol";
import type {
  SaveJob,
  SaveMessage,
  SaveReply,
  SaveStage,
} from "./save-protocol";

const running = new Map<number, string>();
const requests = new Map<number, Promise<SaveReply>>();
let refreshBadge: ((tabId: number) => Promise<void>) | undefined;
const persist = (job: SaveJob) => {
  job.revision = (job.revision ?? 0) + 1;
  return chrome.storage.session.set({ [saveJobKey(job.tabId)]: job });
};

async function readJob(tabId: number): Promise<SaveJob | undefined> {
  return (await chrome.storage.session.get(saveJobKey(tabId)))[
    saveJobKey(tabId)
  ];
}

async function connectionId(settings: Settings): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify([settings.address, settings.apiKey, settings.customHeaders]),
  );
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}

// Serialize commands for one tab so two popup opens cannot start two uploads.
export function handleSaveMessage(message: SaveMessage): Promise<SaveReply> {
  const previous = requests.get(message.tabId) ?? Promise.resolve({});
  const next = previous
    .then(() => handle(message))
    .catch((error: unknown) => ({
      error:
        error instanceof Error ? error.message : "Unable to save the page.",
    }));
  requests.set(message.tabId, next);
  void next.finally(() => {
    if (requests.get(message.tabId) === next) requests.delete(message.tabId);
  });
  return next;
}

function bookmarkTarget(bookmark: SaveJob["bookmark"]): string {
  switch (bookmark.type) {
    case BookmarkTypes.LINK:
      return `link:${bookmark.url}`;
    case BookmarkTypes.TEXT:
      return `text:${bookmark.sourceUrl}:${bookmark.text}`;
    case BookmarkTypes.ASSET:
      return `asset:${bookmark.assetId}`;
  }
}

async function handle(message: SaveMessage): Promise<SaveReply> {
  if (!Number.isInteger(message.tabId)) throw new Error("No page selected.");
  let job = await readJob(message.tabId);
  if (
    job &&
    job.stage !== "saved" &&
    job.stage !== "failed" &&
    running.get(job.tabId) !== job.id
  ) {
    job = {
      ...job,
      failedStage: job.stage,
      stage: "failed",
      error: "Saving was interrupted by the browser. Retry to continue.",
    };
    await persist(job);
  }
  if (message.type === "GET_SAVE") {
    return { job: job?.tabUrl === message.tabUrl ? job : undefined };
  }
  if (message.type === "ACK_SAVE") {
    if (job?.id === message.jobId && job.stage === "saved") {
      await chrome.storage.session.remove(saveJobKey(job.tabId));
    }
    return {};
  }
  if (message.type === "DISCARD_SAVE") {
    if (job?.id !== message.jobId || job.stage !== "failed") {
      throw new Error("Only the current failed save can be discarded.");
    }
    // Drop only the local checkpoint. Assets/bookmarks on the old connection
    // remain untouched, and a new save gets a new identity and request key.
    await chrome.storage.session.remove(saveJobKey(job.tabId));
    return {};
  }
  if (job && running.get(job.tabId) === job.id) {
    if (
      message.type === "START_SAVE" &&
      (message.tabUrl !== job.tabUrl ||
        bookmarkTarget(message.bookmark) !== bookmarkTarget(job.bookmark))
    ) {
      throw new Error(
        "Another bookmark is still being saved from this tab. Reopen the extension to check its progress.",
      );
    }
    return { job };
  }

  const settings = await getPluginSettings();
  if (!settings.address || !settings.apiKey)
    throw new Error("Configure your Karakeep connection first.");
  const identity = await connectionId(settings);
  if (message.type === "RETRY_SAVE") {
    if (!job || job.id !== message.jobId || job.stage !== "failed") {
      throw new Error(
        "This save is no longer available. Reopen the extension.",
      );
    }
    if (job.connectionId !== identity) {
      throw new Error(
        "Your Karakeep connection changed. Restore it before retrying this save.",
      );
    }
    if (message.linkOnly) {
      if (job.assetId || job.bookmarkId)
        throw new Error(
          "The snapshot has already been uploaded. Retry to finish saving it.",
        );
      job.capture = false;
    }
    job.error = undefined;
    job.stage = job.capture && !job.assetId ? "capturing" : "saving";
  } else {
    const bookmark = zNewBookmarkRequestSchema.parse(message.bookmark);
    const capture =
      settings.useSingleFile &&
      bookmark.type === BookmarkTypes.LINK &&
      !bookmark.precrawledArchiveId &&
      bookmark.url === message.tabUrl;
    if (capture && !isHttpUrl(message.tabUrl))
      throw new Error("Only HTTP and HTTPS pages can be captured.");
    job = {
      id: crypto.randomUUID(),
      tabId: message.tabId,
      tabUrl: message.tabUrl,
      bookmark,
      capture,
      connectionId: identity,
      stage: capture ? "capturing" : "saving",
      assetId:
        bookmark.type === BookmarkTypes.LINK
          ? bookmark.precrawledArchiveId
          : undefined,
    };
  }
  await persist(job);
  running.set(job.tabId, job.id);
  // The popup receives the job immediately. Its lifetime does not own the save.
  void runSaveJob(job, settings)
    .catch((error: unknown) =>
      console.warn("Unable to persist save progress:", error),
    )
    .finally(() => {
      if (running.get(job.tabId) === job.id) running.delete(job.tabId);
    });
  return { job };
}

export async function runSaveJob(
  job: SaveJob,
  settings: Settings,
): Promise<void> {
  let stage: SaveStage = job.capture && !job.assetId ? "capturing" : "saving";
  const update = async (next: SaveStage) => {
    stage = next;
    job.stage = next;
    await persist(job);
  };
  // Extension API activity keeps Chromium's event worker alive during a capture.
  // Checkpoints still surface an interruption if the browser terminates it.
  const keepAlive = setInterval(() => {
    void chrome.runtime.getPlatformInfo().catch(() => undefined);
  }, 20_000);
  try {
    if (job.capture && !job.assetId) {
      await update("capturing");
      const html = await capturePageWithSingleFile(job.tabId, {
        expectedUrl: job.tabUrl,
        includeImages: settings.singleFileIncludeImages,
      });
      await update("uploading");
      job.assetId = await uploadSingleFileAsset(
        html,
        settings,
        job.bookmark.title ?? undefined,
      );
      await persist(job);
    }
    const api = createApiClient(settings);
    const request = <T>(promise: Promise<T>) =>
      withTimeout(
        promise,
        60_000,
        "The server did not respond in time. Retry to check and finish this save.",
      );
    await update("saving");
    if (!job.bookmarkId) {
      const bookmark = await request(
        api.bookmarks.createBookmark.mutate({
          ...job.bookmark,
          clientRequestId: job.id,
          source: job.bookmark.source || "extension",
          ...(job.assetId ? { precrawledArchiveId: job.assetId } : {}),
        }),
      );
      job.bookmarkId = bookmark.id;
      job.needsProcessing = bookmark.alreadyExists;
      await persist(job);
    }
    if (job.assetId) {
      await update("attaching");
      // createBookmark deduplicates existing URLs before attaching the archive.
      // Read back also makes a retry safe after a lost mutation response.
      const bookmark = await request(
        api.bookmarks.getBookmark.query({ bookmarkId: job.bookmarkId }),
      );
      if (
        !bookmark.assets.some(
          (asset) =>
            asset.id === job.assetId && asset.assetType === "precrawledArchive",
        )
      ) {
        job.needsProcessing = true;
        await persist(job);
        const previous = bookmark.assets
          .filter((asset) => asset.assetType === "precrawledArchive")
          .pop();
        if (previous) {
          await request(
            api.assets.replaceAsset.mutate({
              bookmarkId: job.bookmarkId,
              oldAssetId: previous.id,
              newAssetId: job.assetId,
            }),
          );
        } else {
          await request(
            api.assets.attachAsset.mutate({
              bookmarkId: job.bookmarkId,
              asset: { id: job.assetId, assetType: "precrawledArchive" },
            }),
          );
        }
      }
      if (job.needsProcessing) {
        await update("processing");
        await request(
          api.bookmarks.recrawlBookmark.mutate({ bookmarkId: job.bookmarkId }),
        );
      }
    }
    if (job.bookmark.type === BookmarkTypes.LINK) {
      await clearBadgeStatus(job.bookmark.url).catch(() => undefined);
    }
    job.stage = "saved";
    job.error = undefined;
    await persist(job);
    await refreshBadge?.(job.tabId).catch(() => undefined);
  } catch (error) {
    job.stage = "failed";
    job.failedStage = stage;
    job.error =
      error instanceof Error ? error.message : "Unable to save the page.";
    await persist(job);
  } finally {
    clearInterval(keepAlive);
  }
}

export function registerSaveHandler(onSaved: (tabId: number) => Promise<void>) {
  refreshBadge = onSaved;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      ![
        "START_SAVE",
        "GET_SAVE",
        "RETRY_SAVE",
        "ACK_SAVE",
        "DISCARD_SAVE",
      ].includes(message?.type)
    )
      return;
    // Only extension pages can start a save, never a website/content script.
    if (
      sender.id !== chrome.runtime.id ||
      !sender.url?.startsWith(chrome.runtime.getURL(""))
    )
      return;
    void handleSaveMessage(message).then(sendResponse);
    return true;
  });
}
