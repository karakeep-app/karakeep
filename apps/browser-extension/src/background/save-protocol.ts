import type { ZNewBookmarkRequest } from "@karakeep/shared/types/bookmarks";

export type SaveStage =
  | "capturing"
  | "uploading"
  | "saving"
  | "attaching"
  | "processing";
export interface SaveJob {
  id: string;
  tabId: number;
  tabUrl: string;
  bookmark: ZNewBookmarkRequest;
  capture: boolean;
  connectionId: string;
  stage: SaveStage | "saved" | "failed";
  failedStage?: SaveStage;
  error?: string;
  assetId?: string;
  bookmarkId?: string;
  needsProcessing?: boolean;
  revision?: number;
}

export type SaveMessage =
  | {
      type: "START_SAVE";
      tabId: number;
      tabUrl: string;
      bookmark: ZNewBookmarkRequest;
    }
  | { type: "GET_SAVE"; tabId: number; tabUrl: string }
  | { type: "RETRY_SAVE"; tabId: number; jobId: string; linkOnly?: boolean }
  | { type: "ACK_SAVE"; tabId: number; jobId: string }
  | { type: "DISCARD_SAVE"; tabId: number; jobId: string };

export interface SaveReply {
  job?: SaveJob;
  error?: string;
}
export const saveJobKey = (tabId: number) => `karakeep-save:${tabId}`;

export function sendSaveMessage(message: SaveMessage): Promise<SaveReply> {
  return chrome.runtime.sendMessage(message);
}
