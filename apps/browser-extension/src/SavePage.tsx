import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  BookmarkTypes,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";
import type { ZNewBookmarkRequest } from "@karakeep/shared/types/bookmarks";

import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./background/protocol";
import { saveJobKey, sendSaveMessage } from "./background/save-protocol";
import type { SaveJob, SaveMessage } from "./background/save-protocol";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import Spinner from "./Spinner";
import { requestPagePermission } from "./utils/permissions";
import usePluginSettings from "./utils/settings";
import { isHttpUrl } from "./utils/url";

const stageLabels = {
  capturing: "Capturing open page",
  uploading: "Uploading page",
  saving: "Saving bookmark",
  attaching: "Attaching captured page",
  processing: "Queuing page processing",
};

export default function SavePage() {
  const navigate = useNavigate();
  const { settings, isPending: isSettingsLoaded } = usePluginSettings();
  const [error, setError] = useState<string>();
  const [job, setJob] = useState<SaveJob>();
  const [pendingBookmark, setPendingBookmark] =
    useState<ZNewBookmarkRequest | null>(null);
  const [currentTab, setCurrentTab] = useState<{ id: number; url: string }>();
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const started = useRef(false);
  const busy = useRef(false);
  const receiveJob = useCallback((next: SaveJob) => {
    setJob((current) =>
      current?.id === next.id && (current.revision ?? 0) > (next.revision ?? 0)
        ? current
        : next,
    );
  }, []);

  useEffect(() => {
    if (!isSettingsLoaded) return;
    let disposed = false;
    async function load() {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (tab?.id === undefined || !tab.url)
        throw new Error("Current tab has no URL to bookmark.");
      const { [NEW_BOOKMARK_REQUEST_KEY_NAME]: stored } =
        await chrome.storage.session.get(NEW_BOOKMARK_REQUEST_KEY_NAME);
      let bookmark: ZNewBookmarkRequest;
      if (stored) {
        bookmark = zNewBookmarkRequestSchema.parse(stored);
        await chrome.storage.session.remove(NEW_BOOKMARK_REQUEST_KEY_NAME);
      } else {
        if (!isHttpUrl(tab.url))
          throw new Error("Only HTTP/HTTPS URLs can be bookmarked.");
        bookmark = {
          type: BookmarkTypes.LINK,
          url: tab.url,
          title: tab.title,
          source: "extension",
        };
      }
      if (disposed) return;
      setCurrentTab({ id: tab.id, url: tab.url });
      setPendingBookmark(bookmark);
      const reply = await sendSaveMessage({
        type: "GET_SAVE",
        tabId: tab.id,
        tabUrl: tab.url,
      });
      if (reply.error) throw new Error(reply.error);
      if (disposed) return;
      // An explicit context-menu request is a new save; a normal popup open
      // reconnects to the operation that continued while the popup was closed.
      if (!stored && reply.job) {
        receiveJob(reply.job);
        started.current = true;
      }
      setReady(true);
    }
    void load().catch((e: unknown) => {
      if (!disposed)
        setError(
          e instanceof Error ? e.message : "Unable to load the current page.",
        );
    });
    return () => {
      disposed = true;
    };
  }, [isSettingsLoaded, receiveJob]);

  useEffect(() => {
    if (!currentTab) return;
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      const next = changes[saveJobKey(currentTab.id)]?.newValue as
        | SaveJob
        | undefined;
      if (
        started.current &&
        area === "session" &&
        next?.tabUrl === currentTab.url
      )
        receiveJob(next);
    };
    chrome.storage.onChanged.addListener(onChange);
    // Close the gap between the initial GET_SAVE and installing the listener.
    if (started.current)
      void sendSaveMessage({
        type: "GET_SAVE",
        tabId: currentTab.id,
        tabUrl: currentTab.url,
      })
        .then((reply) => {
          if (reply.job && started.current) receiveJob(reply.job);
        })
        .catch(() => undefined);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [currentTab, receiveJob]);

  useEffect(() => {
    if (job?.stage !== "saved" || !job.bookmarkId) return;
    void sendSaveMessage({
      type: "ACK_SAVE",
      tabId: job.tabId,
      jobId: job.id,
    }).catch(() => undefined);
    navigate(`/bookmark/${job.bookmarkId}`, { replace: true });
  }, [job, navigate]);

  const submit = async (message: SaveMessage) => {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setError(undefined);
    try {
      const reply = await sendSaveMessage(message);
      if (reply.error) throw new Error(reply.error);
      if (reply.job) receiveJob(reply.job);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to contact the extension background. Reopen the extension to check the save.",
      );
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  const handleManualSave = () => {
    if (!pendingBookmark || !currentTab) return;
    started.current = true;
    void submit({
      type: "START_SAVE",
      tabId: currentTab.id,
      tabUrl: currentTab.url,
      bookmark: pendingBookmark,
    });
  };

  useEffect(() => {
    if (ready && settings.autoSave && !started.current && !job && !error)
      handleManualSave();
  }, [ready, settings.autoSave, job, error]);

  const retry = (linkOnly = false) => {
    if (!job) return;
    void submit({
      type: "RETRY_SAVE",
      tabId: job.tabId,
      jobId: job.id,
      linkOnly,
    });
  };

  if (job?.stage === "failed") {
    return (
      <div className="flex flex-col gap-3" role="alert">
        <p className="font-medium">
          {job.bookmarkId
            ? "Bookmark saved, but saving the page is incomplete"
            : "Page was not saved"}
        </p>
        <p className="text-sm text-red-500">{error ?? job.error}</p>
        <Button disabled={submitting} onClick={() => retry()}>
          Retry
        </Button>
        {job.failedStage === "capturing" && (
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => {
              void requestPagePermission(job.tabUrl)
                .then((granted) => {
                  if (granted) retry();
                  else setError("Access to this website was not granted.");
                })
                .catch((e: unknown) =>
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Unable to request website access.",
                  ),
                );
            }}
          >
            Allow access to this site
          </Button>
        )}
        {job.capture && !job.assetId && !job.bookmarkId && (
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => retry(true)}
          >
            Save link only
          </Button>
        )}
      </div>
    );
  }
  if (error)
    return (
      <div className="flex flex-col gap-3" role="alert">
        <p className="text-red-500">{error}</p>
        <Button
          onClick={handleManualSave}
          disabled={submitting || !pendingBookmark}
        >
          Retry
        </Button>
      </div>
    );
  if (job || submitting || !ready || settings.autoSave) {
    return (
      <div className="flex flex-col gap-2" role="status">
        <div className="flex justify-between text-lg">
          <span>
            {job && job.stage !== "saved"
              ? stageLabels[job.stage]
              : "Saving bookmark"}
          </span>
          <Spinner />
        </div>
        {job && (
          <p className="text-xs text-muted-foreground">
            You can close this popup. Reopen it to check progress.
          </p>
        )}
      </div>
    );
  }
  if (pendingBookmark) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-lg font-medium">Save Bookmark?</p>
        {pendingBookmark.type === BookmarkTypes.LINK && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Title
            </label>
            <Input
              value={pendingBookmark.title ?? ""}
              onChange={(e) =>
                setPendingBookmark((prev) =>
                  prev ? { ...prev, title: e.target.value } : prev,
                )
              }
              placeholder="Untitled"
            />
            <p className="truncate text-xs text-muted-foreground">
              {pendingBookmark.url}
            </p>
          </div>
        )}
        {pendingBookmark.type === BookmarkTypes.TEXT && (
          <p className="text-xs text-muted-foreground">
            {pendingBookmark.text.length > 150
              ? `${pendingBookmark.text.substring(0, 150)}...`
              : pendingBookmark.text}
          </p>
        )}
        {pendingBookmark.type === BookmarkTypes.ASSET && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Title
            </label>
            <Input
              value={pendingBookmark.title ?? ""}
              onChange={(e) =>
                setPendingBookmark((prev) =>
                  prev ? { ...prev, title: e.target.value } : prev,
                )
              }
              placeholder={pendingBookmark.fileName ?? "Asset"}
            />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Notes
          </label>
          <Textarea
            value={pendingBookmark.note ?? ""}
            onChange={(e) =>
              setPendingBookmark((prev) =>
                prev ? { ...prev, note: e.target.value } : prev,
              )
            }
            placeholder="Add notes..."
            className="h-20 resize-none"
          />
        </div>
        <Button onClick={handleManualSave} className="w-full">
          Save Bookmark
        </Button>
      </div>
    );
  }
  return null;
}
