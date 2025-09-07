import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  BookmarkTypes,
  ZNewBookmarkRequest,
} from "@karakeep/shared/types/bookmarks";

import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./background/protocol";
import { Button } from "./components/ui/button";
import Spinner from "./Spinner";
import usePluginSettings from "./utils/settings";
import { api } from "./utils/trpc";

export default function BulkSavePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [error, setError] = useState<string | undefined>(undefined);
  const [allTabs, setAllTabs] = useState<chrome.tabs.Tab[]>([]);
  const [currentWindowTabs, setCurrentWindowTabs] = useState<chrome.tabs.Tab[]>(
    [],
  );
  const [closeTabs, setCloseTabs] = useState(false);
  const [bulkSaveStatus, setBulkSaveStatus] = useState<{
    isActive: boolean;
    progress: number;
    total: number;
    completed: number;
    errors: string[];
    saveType: "all" | "window" | null;
  }>({
    isActive: false,
    progress: 0,
    total: 0,
    completed: 0,
    errors: [],
    saveType: null,
  });

  const {
    settings,
    setSettings,
    isPending: isSettingsLoading,
  } = usePluginSettings();

  useEffect(() => {
    setCloseTabs(Boolean(settings.closeTabsOnBulkSave));
  }, [settings]);

  const { mutate: createBookmark } = api.bookmarks.createBookmark.useMutation({
    onError: (e) => {
      setError("Something went wrong: " + e.message);
    },
  });

  const handleBulkSave = useCallback(
    async (saveType: "all" | "window" = "all") => {
      const tabsToSave = saveType === "all" ? allTabs : currentWindowTabs;

      if (tabsToSave.length === 0) {
        setError("No valid tabs found to save");
        return;
      }

      setBulkSaveStatus({
        isActive: true,
        progress: 0,
        total: tabsToSave.length,
        completed: 0,
        errors: [],
        saveType,
      });

      let completed = 0;
      const errors: string[] = [];
      const savedTabIds: number[] = [];

      const closeTabsHelper = async (tabIds: number[]) => {
        if (!closeTabs || tabIds.length === 0) {
          return;
        }
        try {
          await new Promise<void>((resolve, reject) => {
            chrome.tabs.remove(tabIds, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          });
        } catch {
          for (const tabId of tabIds) {
            await new Promise<void>((resolve) => {
              chrome.tabs.remove(tabId, () => resolve());
            });
          }
        }
      };

      for (let i = 0; i < tabsToSave.length; i++) {
        const tab = tabsToSave[i];
        try {
          await new Promise<void>((resolve) => {
            createBookmark(
              {
                type: BookmarkTypes.LINK,
                url: tab.url!,
                title: tab.title || undefined,
              } as ZNewBookmarkRequest,
              {
                onSuccess: () => {
                  completed++;
                  if (tab.id) {
                    savedTabIds.push(tab.id);
                  }
                  setBulkSaveStatus((prev) => ({
                    ...prev,
                    progress: ((i + 1) / tabsToSave.length) * 100,
                    completed: completed,
                  }));
                  resolve();
                },
                onError: (error) => {
                  const errorMsg = `${tab.title || tab.url}: ${error.message}`;
                  errors.push(errorMsg);
                  setBulkSaveStatus((prev) => ({
                    ...prev,
                    progress: ((i + 1) / tabsToSave.length) * 100,
                    errors: [...prev.errors, errorMsg],
                  }));
                  resolve();
                },
              },
            );
          });
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          const errorMsg = `${tab.title || tab.url}: ${error instanceof Error ? error.message : "Unknown error"}`;
          errors.push(errorMsg);
          setBulkSaveStatus((prev) => ({
            ...prev,
            errors: [...prev.errors, errorMsg],
          }));
        }
      }

      if (savedTabIds.length > 0) {
        await closeTabsHelper(savedTabIds);
      }

      setBulkSaveStatus((prev) => ({
        ...prev,
        isActive: false,
      }));

      if (completed === tabsToSave.length) {
        setError(undefined);
      } else if (completed > 0) {
        setError(
          `Saved ${completed} of ${tabsToSave.length} tabs. Some tabs failed to save.`,
        );
      } else {
        setError("Failed to save any tabs.");
      }

      if (closeTabs) {
        setTimeout(() => {
          try {
            window.close();
          } catch {
            /* ignore window close errors */
          }
        }, 700);
      }
    },
    [allTabs, currentWindowTabs, createBookmark, closeTabs],
  );

  useEffect(() => {
    if (isSettingsLoading) {
      return;
    }

    async function prepare() {
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

      const auto = searchParams.get("auto");
      if (auto === "window" && !bulkSaveStatus.isActive) {
        handleBulkSave("window");
        return;
      }

      const { [NEW_BOOKMARK_REQUEST_KEY_NAME]: req } =
        await chrome.storage.session.get(NEW_BOOKMARK_REQUEST_KEY_NAME);
      if (req?.type === "BULK_SAVE_ALL_TABS") {
        await chrome.storage.session.remove(NEW_BOOKMARK_REQUEST_KEY_NAME);
        if (!bulkSaveStatus.isActive) {
          handleBulkSave("window");
        }
      }
    }

    prepare();
  }, [
    isSettingsLoading,
    handleBulkSave,
    searchParams,
    bulkSaveStatus.isActive,
  ]);

  const disableWindowSave = useMemo(
    () => currentWindowTabs.length === 0,
    [currentWindowTabs.length],
  );
  const disableAllSave = useMemo(() => allTabs.length === 0, [allTabs.length]);

  if (isSettingsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (bulkSaveStatus.isActive) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="mb-2 text-lg font-semibold text-gray-800">
            {bulkSaveStatus.saveType === "window"
              ? "Saving Current Window Tabs"
              : "Saving All Tabs"}
          </h2>
          <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="flex justify-between text-sm font-medium text-blue-800">
              <span>Progress:</span>
              <span>
                {bulkSaveStatus.completed} / {bulkSaveStatus.total}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-blue-200">
              <div
                className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${bulkSaveStatus.progress}%` }}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!bulkSaveStatus.isActive && bulkSaveStatus.total > 0) {
    const hasErrors = bulkSaveStatus.errors.length > 0;
    return (
      <div className="space-y-4">
        <div>
          <h2 className="mb-2 text-lg font-semibold">
            {bulkSaveStatus.saveType === "window"
              ? "Window Save Complete!"
              : "Bulk Save Complete!"}
          </h2>
          <div
            className={`space-y-2 rounded-lg p-3 ${hasErrors ? "border border-yellow-200 bg-yellow-50" : "border border-green-200 bg-green-50"}`}
          >
            <div className="text-sm">
              <div
                className={`font-semibold ${hasErrors ? "text-yellow-800" : "text-green-800"}`}
              >
                Successfully saved: {bulkSaveStatus.completed} /{" "}
                {bulkSaveStatus.total} tabs
              </div>
              {closeTabs && bulkSaveStatus.completed > 0 && (
                <div className="mt-1 text-xs text-gray-600">
                  {bulkSaveStatus.completed > 1
                    ? "Tabs have been closed"
                    : "Tab has been closed"}
                </div>
              )}
              {hasErrors && (
                <div className="mt-2">
                  <div className="font-semibold text-yellow-800">Errors:</div>
                  <div className="mt-1 max-h-20 overflow-y-auto rounded bg-yellow-100 p-2 text-xs text-yellow-700">
                    {bulkSaveStatus.errors.slice(0, 3).map((err, i) => (
                      <div key={i} className="mb-1 truncate">
                        {err}
                      </div>
                    ))}
                    {bulkSaveStatus.errors.length > 3 && (
                      <div className="font-medium">
                        ... and {bulkSaveStatus.errors.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() =>
              setBulkSaveStatus({
                isActive: false,
                progress: 0,
                total: 0,
                completed: 0,
                errors: [],
                saveType: null,
              })
            }
            className="w-full"
          >
            Done
          </Button>
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="w-full"
          >
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Bulk Save</h2>
        <Button onClick={() => navigate("/")} variant="outline">
          Back
        </Button>
      </div>

      <div className="mb-3 flex items-center space-x-2">
        <input
          type="checkbox"
          id="closeTabs"
          checked={closeTabs}
          onChange={(e) => {
            setCloseTabs(e.target.checked);
            setSettings((s) => ({
              ...s,
              closeTabsOnBulkSave: e.target.checked,
            }));
          }}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
        <label htmlFor="closeTabs" className="text-sm text-gray-700">
          Close tabs after saving
        </label>
      </div>

      {currentWindowTabs.length > 0 && (
        <Button
          onClick={() => handleBulkSave("window")}
          variant="outline"
          className="mb-2 w-full"
          disabled={disableWindowSave}
        >
          Save Current Window Tabs ({currentWindowTabs.length})
        </Button>
      )}

      {allTabs.length > currentWindowTabs.length && (
        <Button
          onClick={() => handleBulkSave("all")}
          variant="outline"
          className="w-full"
          disabled={disableAllSave}
        >
          Save multiple tabs ({allTabs.length})
        </Button>
      )}

      {error && <div className="text-sm text-red-500">{error}</div>}
    </div>
  );
}
