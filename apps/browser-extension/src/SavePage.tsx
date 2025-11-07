import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import {
  BookmarkTypes,
  ZNewBookmarkRequest,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";

import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./background/protocol";
import Spinner from "./Spinner";
import { api } from "./utils/trpc";
import { MessageType } from "./utils/type";
import { isHttpUrl } from "./utils/url";

export default function SavePage() {
  const [error, setError] = useState<string | undefined>(undefined);

  const {
    data,
    mutate: createBookmark,
    status,
  } = api.bookmarks.createBookmark.useMutation({
    onError: (e) => {
      setError("Something went wrong: " + e.message);
    },
    onSuccess: async () => {
      // After successful creation, update badge cache and notify background
      const [currentTab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      await chrome.runtime.sendMessage({
        type: MessageType.BOOKMARK_REFRESH_BADGE,
        currentTab: currentTab,
      });
    },
  });
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

    async function runSave() {
      let newBookmarkRequest =
        await getNewBookmarkRequestFromBackgroundScriptIfAny();
      if (!newBookmarkRequest) {
        const [currentTab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (!currentTab.url) {
          setError("Current tab has no URL to bookmark.");
          return;
        }

        if (!isHttpUrl(currentTab.url)) {
          setError(
            "Cannot bookmark this type of URL. Only HTTP/HTTPS URLs are supported.",
          );
          return;
        }

        newBookmarkRequest = {
          type: BookmarkTypes.LINK,
          title: currentTab.title,
          url: currentTab.url,
          source: "extension",
        };
      }

      createBookmark({
        ...newBookmarkRequest,
        source: newBookmarkRequest.source || "extension",
      });
    }

    runSave();
  }, [createBookmark]);

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
      return <div />;
    }
  }
}
