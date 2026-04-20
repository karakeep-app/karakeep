import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import {
  BookmarkTypes,
  ZNewBookmarkRequest,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";

import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./background/protocol";
import Spinner from "./Spinner";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import usePluginSettings from "./utils/settings";
import { useTRPC } from "./utils/trpc";
import { MessageType } from "./utils/type";
import { isHttpUrl } from "./utils/url";

export default function SavePage() {
  const api = useTRPC();
  const { settings, isPending: isSettingsLoaded } = usePluginSettings();
  const [error, setError] = useState<string | undefined>(undefined);
  const [pendingBookmark, setPendingBookmark] =
    useState<ZNewBookmarkRequest | null>(null);
  const [hasCheckedRequest, setHasCheckedRequest] = useState(false);

  const {
    data,
    mutate: createBookmark,
    status,
  } = useMutation(
    api.bookmarks.createBookmark.mutationOptions({
      onError: (e) => {
        setError("Something went wrong: " + e.message);
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
      let newBookmarkRequest =
        await getNewBookmarkRequestFromBackgroundScriptIfAny();
      if (!newBookmarkRequest) {
        const [currentTab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (!currentTab.url) {
          setError("Current tab has no URL to bookmark.");
          setHasCheckedRequest(true);
          return;
        }

        if (!isHttpUrl(currentTab.url)) {
          setError(
            "Cannot bookmark this type of URL. Only HTTP/HTTPS URLs are supported.",
          );
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

  // Auto-save when settings are loaded and we have a pending bookmark
  useEffect(() => {
    if (
      hasCheckedRequest &&
      pendingBookmark &&
      settings.autoSave &&
      status === "idle"
    ) {
      createBookmark({
        ...pendingBookmark,
        source: pendingBookmark.source || "extension",
      });
    }
  }, [
    hasCheckedRequest,
    pendingBookmark,
    settings.autoSave,
    status,
    createBookmark,
  ]);

  const handleManualSave = () => {
    if (pendingBookmark) {
      createBookmark({
        ...pendingBookmark,
        source: pendingBookmark.source || "extension",
      });
    }
  };

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  switch (status) {
    case "error": {
      return <div className="text-red-500">{error}</div>;
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
      if (!settings.autoSave && pendingBookmark && hasCheckedRequest) {
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
