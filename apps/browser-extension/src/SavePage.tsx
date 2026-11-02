import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BookmarkPlus, Link2 } from "lucide-react";
import { Navigate } from "react-router-dom";

import {
  BookmarkTypes,
  ZNewBookmarkRequest,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";

import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./background/protocol";
import { ErrorCallout } from "./components/ErrorCallout";
import { StatusMessage } from "./components/StatusMessage";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
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
  const api = useTRPC();
  const { settings, isPending: isSettingsLoaded } = usePluginSettings();
  const [error, setError] = useState<string | undefined>(undefined);
  const [isCapturing, setIsCapturing] = useState(false);
  const [pendingBookmark, setPendingBookmark] =
    useState<ZNewBookmarkRequest | null>(null);
  const [hasCheckedRequest, setHasCheckedRequest] = useState(false);
  const [currentTabId, setCurrentTabId] = useState<number | undefined>(
    undefined,
  );
  const [currentTabUrl, setCurrentTabUrl] = useState<string | undefined>(
    undefined,
  );

  const {
    data,
    mutate: createBookmark,
    status,
  } = useMutation(
    api.bookmarks.createBookmark.mutationOptions({
      onError: (e) => {
        setError(e.message);
      },
      onSuccess: async () => {
        // After successful creation, update badge cache and notify background
        try {
          const [currentTab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
          });
          await chrome.runtime.sendMessage({
            type: MessageType.BOOKMARK_REFRESH_BADGE,
            currentTab: currentTab,
          });
        } catch {
          // Badge refresh is best-effort — on Firefox Android the background
          // script may not be reachable from the popup context.
        }
      },
    }),
  );

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

    async function loadBookmarkRequest() {
      const [currentTab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      setCurrentTabId(currentTab?.id);
      setCurrentTabUrl(currentTab?.url);

      let newBookmarkRequest =
        await getNewBookmarkRequestFromBackgroundScriptIfAny();
      if (!newBookmarkRequest) {
        if (!currentTab?.url) {
          setError("This tab doesn't have a link to save.");
          setHasCheckedRequest(true);
          return;
        }

        if (!isHttpUrl(currentTab.url)) {
          setError("Only web pages (http:// and https:// links) can be saved.");
          setHasCheckedRequest(true);
          return;
        }

        newBookmarkRequest = {
          type: BookmarkTypes.LINK,
          title: currentTab.title,
          url: currentTab.url,
          source: "extension",
        };
      }

      setPendingBookmark(newBookmarkRequest);
      setHasCheckedRequest(true);
    }

    if (!isSettingsLoaded) return;
    loadBookmarkRequest();
  }, [isSettingsLoaded]);

  const saveBookmark = async (bookmark: ZNewBookmarkRequest) => {
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
        setIsCapturing(true);
        const html = await capturePageWithSingleFile(currentTabId, {
          includeImages: settings.singleFileIncludeImages,
        });
        const precrawledArchiveId = await uploadSingleFileAsset(
          html,
          bookmark.title ?? undefined,
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
    createBookmark({
      ...finalBookmark,
      source: finalBookmark.source || "extension",
    });
  };

  // Auto-save when settings are loaded and we have a pending bookmark
  useEffect(() => {
    if (
      hasCheckedRequest &&
      pendingBookmark &&
      settings.autoSave &&
      status === "idle" &&
      !isCapturing &&
      !error
    ) {
      saveBookmark(pendingBookmark);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasCheckedRequest,
    pendingBookmark,
    settings.autoSave,
    status,
    isCapturing,
    error,
  ]);

  const handleManualSave = () => {
    if (pendingBookmark) {
      saveBookmark(pendingBookmark);
    }
  };

  if (error) {
    return <ErrorCallout title="Couldn't save this page">{error}</ErrorCallout>;
  }

  const pendingLabel =
    pendingBookmark?.type === BookmarkTypes.LINK
      ? pendingBookmark.url
      : pendingBookmark?.type === BookmarkTypes.TEXT
        ? pendingBookmark.text
        : pendingBookmark?.fileName;

  if (isCapturing) {
    return <StatusMessage label="Capturing page…" detail={pendingLabel} />;
  }

  switch (status) {
    case "error": {
      return (
        <ErrorCallout title="Couldn't save this page">{error}</ErrorCallout>
      );
    }
    case "success": {
      return <Navigate to={`/bookmark/${data.id}`} />;
    }
    case "pending": {
      return (
        <StatusMessage label="Saving to Karakeep…" detail={pendingLabel} />
      );
    }
    case "idle": {
      // Show confirmation UI when autoSave is disabled
      if (!settings.autoSave && pendingBookmark && hasCheckedRequest) {
        return (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleManualSave();
            }}
          >
            <h2 className="text-base font-semibold">Save to Karakeep</h2>
            {pendingBookmark.type === BookmarkTypes.LINK && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="bookmark-title" className="text-sm font-medium">
                  Title
                </label>
                <Input
                  id="bookmark-title"
                  value={pendingBookmark.title ?? ""}
                  onChange={(e) =>
                    setPendingBookmark((prev) =>
                      prev ? { ...prev, title: e.target.value } : prev,
                    )
                  }
                  placeholder="Untitled"
                />
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Link2 className="size-3.5 shrink-0" />
                  <span className="truncate">{pendingBookmark.url}</span>
                </p>
              </div>
            )}
            {pendingBookmark.type === BookmarkTypes.TEXT && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Text</span>
                <p className="line-clamp-4 whitespace-pre-wrap rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  {pendingBookmark.text}
                </p>
              </div>
            )}
            {pendingBookmark.type === BookmarkTypes.ASSET && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="bookmark-title" className="text-sm font-medium">
                  Title
                </label>
                <Input
                  id="bookmark-title"
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
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bookmark-note" className="text-sm font-medium">
                Note{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <Textarea
                id="bookmark-note"
                value={pendingBookmark.note ?? ""}
                onChange={(e) =>
                  setPendingBookmark((prev) =>
                    prev ? { ...prev, note: e.target.value } : prev,
                  )
                }
                placeholder="Why are you saving this?"
                className="h-20 resize-none"
              />
            </div>
            <Button type="submit" className="w-full gap-2">
              <BookmarkPlus className="size-4" />
              Save bookmark
            </Button>
          </form>
        );
      }
      return (
        <StatusMessage label="Saving to Karakeep…" detail={pendingLabel} />
      );
    }
  }
}
