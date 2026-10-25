import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";

import {
  BookmarkTypes,
  ZNewBookmarkRequest,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";

import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./background/protocol";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import Spinner from "./Spinner";
import { hasHostPermission } from "./utils/permissions";
import usePluginSettings from "./utils/settings";
import {
  capturePageWithSingleFile,
  uploadSingleFileAsset,
} from "./utils/singlefile";
import { useTRPC } from "./utils/trpc";
import { MessageType } from "./utils/type";
import { isHttpUrl } from "./utils/url";

export default function SavePage() {
  const { isPending: isSettingsLoaded } = usePluginSettings();
  const [target, setTarget] = useState<{
    bookmark: ZNewBookmarkRequest;
    tabId?: number;
    tabUrl?: string;
  } | null>(null);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const backgroundRequest = useRef<Promise<ZNewBookmarkRequest | null>>(null);

  useEffect(() => {
    async function getNewBookmarkRequestFromBackgroundScriptIfAny(): Promise<ZNewBookmarkRequest | null> {
      const { [NEW_BOOKMARK_REQUEST_KEY_NAME]: req } =
        await chrome.storage.session.get(NEW_BOOKMARK_REQUEST_KEY_NAME);
      if (!req) {
        return null;
      }
      // Delete the request immediately to avoid issues with lingering values
      await chrome.storage.session.remove(NEW_BOOKMARK_REQUEST_KEY_NAME);
      return zNewBookmarkRequestSchema.parse(req);
    }

    if (!isSettingsLoaded) return;
    let cancelled = false;
    let generation = 0;
    let targetWindowId: number | undefined;
    let targetTabId: number | undefined;
    let targetTabUrl: string | undefined;
    let hasResolvedTab = false;
    // Consume a context-menu request once, including across effect restarts.
    backgroundRequest.current ??=
      getNewBookmarkRequestFromBackgroundScriptIfAny().catch((e) => {
        backgroundRequest.current = null;
        throw e;
      });
    const requestFromBackground = backgroundRequest.current;

    async function loadBookmarkRequest() {
      const currentGeneration = ++generation;
      setTarget(null);
      setError(undefined);
      try {
        const [currentTab, backgroundBookmark] = await Promise.all([
          chrome.tabs
            .query(
              targetWindowId === undefined
                ? { active: true, lastFocusedWindow: true }
                : { active: true, windowId: targetWindowId },
            )
            .then(([tab]) => {
              if (cancelled || currentGeneration !== generation) return;
              // Track target events even while the context-menu read is pending.
              targetWindowId ??= tab?.windowId;
              targetTabId = tab?.id;
              targetTabUrl = tab?.url;
              hasResolvedTab = true;
              return tab;
            }),
          requestFromBackground,
        ]);
        if (cancelled || currentGeneration !== generation) return;
        let newBookmarkRequest = backgroundBookmark;
        if (!newBookmarkRequest) {
          if (!currentTab?.url) {
            throw new Error("Current tab has no URL to bookmark.");
          }

          if (!isHttpUrl(currentTab.url)) {
            throw new Error(
              "Cannot bookmark this type of URL. Only HTTP/HTTPS URLs are supported.",
            );
          }

          newBookmarkRequest = {
            type: BookmarkTypes.LINK,
            title: currentTab.title,
            url: currentTab.url,
            source: "extension",
          };
        }

        if (!cancelled && currentGeneration === generation) {
          setTarget({
            bookmark: newBookmarkRequest,
            tabId: currentTab?.id,
            tabUrl: currentTab?.url,
          });
        }
      } catch (e) {
        if (!cancelled && currentGeneration === generation) {
          setError(
            e instanceof Error ? e.message : "Could not read the current tab.",
          );
        }
      }
    }

    const onUpdated = (
      tabId: number,
      change: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (!hasResolvedTab) {
        // No draft exists yet. Invalidate a possibly obsolete initial query.
        if (tab.active && change.url) void loadBookmarkRequest();
        return;
      }
      // Tab events cover every window, including active tabs in unfocused
      // windows. Only a change to this popup's target may discard its draft.
      if (
        tabId === targetTabId &&
        tab.active &&
        change.url &&
        change.url !== targetTabUrl
      ) {
        targetTabUrl = change.url;
        void loadBookmarkRequest();
      }
    };
    const onActivated = (info: chrome.tabs.TabActiveInfo) => {
      if (!hasResolvedTab) {
        void loadBookmarkRequest();
        return;
      }
      if (info.windowId !== targetWindowId || info.tabId === targetTabId)
        return;
      targetTabId = info.tabId;
      targetTabUrl = undefined;
      void loadBookmarkRequest();
    };
    void loadBookmarkRequest();
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onActivated.addListener(onActivated);
    return () => {
      cancelled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onActivated.removeListener(onActivated);
    };
  }, [isSettingsLoaded, attempt]);

  if (error) {
    return (
      <div className="flex flex-col gap-2" role="alert">
        <p className="text-red-700 dark:text-red-400">{error}</p>
        <Button onClick={() => setAttempt((value) => value + 1)}>
          Try Again
        </Button>
      </div>
    );
  }
  if (!target)
    return (
      <div role="status">
        Loading current page... <Spinner />
      </div>
    );

  return <SaveBookmark key={JSON.stringify(target)} {...target} />;
}

function SaveBookmark({
  bookmark,
  tabId: currentTabId,
  tabUrl: currentTabUrl,
}: {
  bookmark: ZNewBookmarkRequest;
  tabId?: number;
  tabUrl?: string;
}) {
  const api = useTRPC();
  const { settings, isPending: isSettingsLoaded } = usePluginSettings();
  const [pendingBookmark, setPendingBookmark] = useState(bookmark);
  const [error, setError] = useState<string>();
  const [isCapturing, setIsCapturing] = useState(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const lookup = useQuery(
    api.bookmarks.checkUrl.queryOptions(
      { url: bookmark.type === BookmarkTypes.LINK ? bookmark.url : "" },
      {
        enabled: bookmark.type === BookmarkTypes.LINK,
        // Never trust the badge cache (including a cached miss) before saving.
        staleTime: 0,
        gcTime: 0,
        retry: false,
        trpc: { abortOnUnmount: true },
        refetchOnMount: "always",
        refetchOnWindowFocus: false,
      },
    ),
  );
  const canSave =
    isSettingsLoaded &&
    (bookmark.type !== BookmarkTypes.LINK ||
      (lookup.isSuccess &&
        !lookup.isFetching &&
        lookup.data.bookmarkId === null));

  const {
    data,
    mutate: createBookmark,
    status,
  } = useMutation(
    api.bookmarks.createBookmark.mutationOptions({
      onError: (e) => setError("Something went wrong: " + e.message),
      onSuccess: async () => {
        try {
          const [currentTab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
          });
          await chrome.runtime.sendMessage({
            type: MessageType.BOOKMARK_REFRESH_BADGE,
            currentTab,
          });
        } catch {
          // Badge refresh is best-effort (e.g. Firefox Android).
        }
      },
    }),
  );

  const saveBookmark = async (bookmark: ZNewBookmarkRequest) => {
    if (!canSave || saving.current) return;
    saving.current = true;
    try {
      let finalBookmark = bookmark;
      // Only crawl when the bookmark target matches the active tab — context-menu
      // saves (link/src URL) may create a bookmark for a different URL, in which
      // case capturing the current page would attach the wrong archive.
      if (
        settings.useSingleFile &&
        currentTabId !== undefined &&
        bookmark.type === BookmarkTypes.LINK &&
        !bookmark.precrawledArchiveId &&
        currentTabUrl !== undefined &&
        bookmark.url === currentTabUrl &&
        // The `<all_urls>` host permission is optional and only granted when the
        // user opts in to client-side crawling; it may have been revoked since.
        (await hasHostPermission())
      ) {
        try {
          const tab = await chrome.tabs.get(currentTabId);
          if (!mounted.current) return;
          if (tab.url !== currentTabUrl) {
            setError(
              "The page changed. Reopen the extension to save the current page.",
            );
            return;
          }
          setIsCapturing(true);
          const html = await capturePageWithSingleFile(currentTabId, {
            includeImages: settings.singleFileIncludeImages,
          });
          if (!mounted.current) return;
          const precrawledArchiveId = await uploadSingleFileAsset(
            html,
            bookmark.title ?? undefined,
            settings,
          );
          finalBookmark = { ...bookmark, precrawledArchiveId };
        } catch (e) {
          // Client-side crawling is best-effort — fall back to a plain bookmark
          // so users can still save links on pages where capture is blocked.
          console.warn("Client-side crawl failed, saving without archive:", e);
        } finally {
          setIsCapturing(false);
        }
      }
      if (!mounted.current) return;
      createBookmark({
        ...finalBookmark,
        source: finalBookmark.source || "extension",
      });
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Could not save bookmark.");
    }
  };

  // Auto-save when settings are loaded and we have a pending bookmark
  useEffect(() => {
    if (
      canSave &&
      settings.autoSave &&
      status === "idle" &&
      !isCapturing &&
      !error
    ) {
      saveBookmark(pendingBookmark);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSave, pendingBookmark, settings.autoSave, status, isCapturing, error]);

  const handleManualSave = () => {
    if (canSave) {
      saveBookmark(pendingBookmark);
    }
  };

  if (bookmark.type === BookmarkTypes.LINK) {
    if (lookup.isError) {
      return (
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-red-700 dark:text-red-400">
            Could not check whether this page is already saved.{" "}
            {lookup.error.message}
          </p>
          <Button onClick={() => lookup.refetch()}>Try Again</Button>
          {lookup.error.data?.code === "UNAUTHORIZED" && (
            <Link to="/signin">Sign in</Link>
          )}
        </div>
      );
    }
    if (lookup.isPending || lookup.isFetching) {
      return (
        <div role="status">
          Checking for an existing bookmark... <Spinner />
        </div>
      );
    }
    if (lookup.data.bookmarkId) {
      return <Navigate replace to={`/bookmark/${lookup.data.bookmarkId}`} />;
    }
  }

  if (error) {
    return <div className="text-red-700 dark:text-red-400">{error}</div>;
  }

  if (isCapturing) {
    return (
      <div className="flex justify-between text-lg">
        <span>Capturing Page </span>
        <Spinner />
      </div>
    );
  }

  switch (status) {
    case "error": {
      return <div className="text-red-700 dark:text-red-400">{error}</div>;
    }
    case "success": {
      return <Navigate to={`/bookmark/${data.id}`} />;
    }
    case "pending": {
      return (
        <div className="flex justify-between text-lg">
          <span>Saving Bookmark </span>
          <Spinner />
        </div>
      );
    }
    case "idle": {
      // Show confirmation UI when autoSave is disabled
      if (!settings.autoSave) {
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
      return (
        <div className="flex justify-between text-lg">
          <span>Saving Bookmark </span>
          <Spinner />
        </div>
      );
    }
  }
}
