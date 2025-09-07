import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import {
  BookmarkTypes,
  ZNewBookmarkRequest,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";

import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./background/protocol";
import { Button } from "./components/ui/button";
import Spinner from "./Spinner";
import usePluginSettings from "./utils/settings";
import { api } from "./utils/trpc";

export default function SavePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | undefined>(undefined);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [bookmarkRequest, setBookmarkRequest] =
    useState<ZNewBookmarkRequest | null>(null);
  const [allTabs, setAllTabs] = useState<chrome.tabs.Tab[]>([]);
  const [currentWindowTabs, setCurrentWindowTabs] = useState<chrome.tabs.Tab[]>(
    [],
  );
  const [shouldTriggerBulkSave, setShouldTriggerBulkSave] = useState(false);

  const { settings, isPending: isSettingsLoading } = usePluginSettings();

  const {
    data,
    mutate: createBookmark,
    status,
  } = api.bookmarks.createBookmark.useMutation({
    onError: (e) => {
      setError("Something went wrong: " + e.message);
    },
  });

  useEffect(() => {
    if (isSettingsLoading) {
      return;
    }

    if (!settings.apiKey || !settings.address) {
      return;
    }

    async function prepareBookmarkData() {
      let newBookmarkRequest = null;

      const { [NEW_BOOKMARK_REQUEST_KEY_NAME]: req } =
        await chrome.storage.session.get(NEW_BOOKMARK_REQUEST_KEY_NAME);

      if (req) {
        // Delete the request immediately to avoid issues with lingering values
        await chrome.storage.session.remove(NEW_BOOKMARK_REQUEST_KEY_NAME);

        if (req.type === "BULK_SAVE_ALL_TABS") {
          setShouldTriggerBulkSave(true);
          return;
        }

        newBookmarkRequest = zNewBookmarkRequestSchema.parse(req);
      } else {
        const [currentTab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });

        setCurrentTab(currentTab);

        if (currentTab?.url) {
          newBookmarkRequest = {
            type: BookmarkTypes.LINK,
            url: currentTab.url,
          } as ZNewBookmarkRequest;
        } else {
          setError("Couldn't find the URL of the current tab");
          return;
        }
      }

      const tabs = await chrome.tabs.query({});
      const validTabs = tabs.filter(
        (tab) =>
          tab.url &&
          (tab.url.startsWith("http://") || tab.url.startsWith("https://")) &&
          !tab.url.startsWith("chrome://") &&
          !tab.url.startsWith("chrome-extension://") &&
          !tab.url.startsWith("moz-extension://"),
      );
      setAllTabs(validTabs);

      const currentWindowTabsQuery = await chrome.tabs.query({
        currentWindow: true,
      });
      const validCurrentWindowTabs = currentWindowTabsQuery.filter(
        (tab) =>
          tab.url &&
          (tab.url.startsWith("http://") || tab.url.startsWith("https://")) &&
          !tab.url.startsWith("chrome://") &&
          !tab.url.startsWith("chrome-extension://") &&
          !tab.url.startsWith("moz-extension://"),
      );
      setCurrentWindowTabs(validCurrentWindowTabs);

      setBookmarkRequest(newBookmarkRequest);

      if (settings.autoSave && newBookmarkRequest) {
        createBookmark(newBookmarkRequest);
      }
    }

    prepareBookmarkData();
  }, [
    createBookmark,
    settings.autoSave,
    settings.apiKey,
    settings.address,
    isSettingsLoading,
  ]);

  useEffect(() => {
    if (shouldTriggerBulkSave) {
      setShouldTriggerBulkSave(false);
      navigate("/bulk-save?auto=window");
    }
  }, [shouldTriggerBulkSave, navigate]);

  const handleManualSave = () => {
    if (bookmarkRequest) {
      createBookmark(bookmarkRequest);
    }
  };

  if (isSettingsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!settings.apiKey || !settings.address) {
    return (
      <div className="py-4 text-center">
        <p className="text-gray-600">Extension not configured.</p>
        <p className="text-sm text-gray-500">Please check your settings.</p>
      </div>
    );
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
      if (!settings.autoSave) {
        return (
          <div className="space-y-4">
            <div>
              <h2 className="mb-2 text-lg font-semibold">Save Bookmark</h2>
              {currentTab && (
                <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                  <div className="text-sm font-medium text-gray-700">
                    {currentTab.title || "Untitled"}
                  </div>
                  <div className="break-all text-xs text-gray-500">
                    {currentTab.url}
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={handleManualSave}
              className="w-full"
              disabled={!bookmarkRequest}
            >
              Save Current Tab
            </Button>

            {(allTabs.length > 1 || currentWindowTabs.length > 1) && (
              <>
                <div className="text-center text-sm text-gray-500">or</div>

                <Button
                  onClick={() => navigate("/bulk-save")}
                  variant="outline"
                  className="w-full"
                >
                  Save multiple tabs
                </Button>
              </>
            )}

            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
        );
      } else {
        return (
          <div className="space-y-4">
            <div>
              <h2 className="mb-2 text-lg font-semibold">Quick Actions</h2>
              <div className="mb-3 text-sm text-gray-600">
                Current tab will be saved automatically
              </div>
            </div>

            {(allTabs.length > 1 || currentWindowTabs.length > 1) && (
              <div className="space-y-2">
                <Button
                  onClick={() => navigate("/bulk-save")}
                  variant="outline"
                  className="w-full"
                >
                  Save multiple tabs
                </Button>
              </div>
            )}

            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
        );
      }
    }
  }
}
