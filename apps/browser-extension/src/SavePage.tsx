import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import {
  BookmarkTypes,
  ZNewBookmarkRequest,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";

import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./background/protocol";
import Spinner from "./Spinner";
import usePluginSettings from "./utils/settings";
import { api } from "./utils/trpc";

export default function SavePage() {
  const [error, setError] = useState<string | undefined>(undefined);
  const { settings } = usePluginSettings();

  const { mutate: addToList } = api.lists.addToList.useMutation({
    onError: (e) => {
      setError("Failed to add to default list: " + e.message);
    },
  });

  const {
    data,
    mutate: createBookmark,
    status,
  } = api.bookmarks.createBookmark.useMutation({
    onSuccess: (bookmark) => {
      // If user has a default list configured, automatically add the bookmark to it
      if (settings.defaultListId && !bookmark.alreadyExists) {
        addToList({
          bookmarkId: bookmark.id,
          listId: settings.defaultListId,
        });
      }
    },
    onError: (e) => {
      setError("Something went wrong: " + e.message);
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
        if (currentTab?.url) {
          newBookmarkRequest = {
            type: BookmarkTypes.LINK,
            url: currentTab.url,
          };
        } else {
          setError("Couldn't find the URL of the current tab");
          return;
        }
      }

      createBookmark(newBookmarkRequest);
    }
    runSave();
  }, [createBookmark]);

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
