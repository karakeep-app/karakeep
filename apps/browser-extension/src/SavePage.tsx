import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

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
  const [error, setError] = useState<string | undefined>(undefined);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [bookmarkRequest, setBookmarkRequest] =
    useState<ZNewBookmarkRequest | null>(null);
  const [allTabs, setAllTabs] = useState<chrome.tabs.Tab[]>([]);
  const [currentWindowTabs, setCurrentWindowTabs] = useState<chrome.tabs.Tab[]>(
    [],
  );
  const [shouldTriggerBulkSave, setShouldTriggerBulkSave] = useState(false);
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

      // Helper function to close tabs
      const closeTabsHelper = async (tabIds: number[]) => {
        if (!closeTabs || tabIds.length === 0) {
          console.log(
            "Not closing tabs - closeTabs:",
            closeTabs,
            "tabIds length:",
            tabIds.length,
          );
          return;
        }

        console.log("🔄 Starting tab closing process for tabs:", tabIds);

        try {
          // Use Promise-based approach for better error handling
          await new Promise<void>((resolve, reject) => {
            chrome.tabs.remove(tabIds, () => {
              if (chrome.runtime.lastError) {
                console.error(
                  "❌ Bulk tab close failed:",
                  chrome.runtime.lastError.message,
                );
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                console.log("✅ Successfully closed tabs:", tabIds);
                resolve();
              }
            });
          });
        } catch (error) {
          console.warn(
            "⚠️ Bulk close failed, trying individual closes...",
            error,
          );

          // Fallback: close tabs individually
          let successCount = 0;
          for (const tabId of tabIds) {
            try {
              await new Promise<void>((resolve) => {
                chrome.tabs.remove(tabId, () => {
                  if (chrome.runtime.lastError) {
                    console.error(
                      `❌ Failed to close tab ${tabId}:`,
                      chrome.runtime.lastError.message,
                    );
                    resolve(); // Don't reject, just continue
                  } else {
                    console.log(`✅ Successfully closed tab ${tabId}`);
                    successCount++;
                    resolve();
                  }
                });
              });
            } catch (tabError) {
              console.error(`❌ Exception closing tab ${tabId}:`, tabError);
            }
          }

          if (successCount > 0) {
            console.log(
              `✅ Individually closed ${successCount}/${tabIds.length} tabs`,
            );
          }
        }
      };

      // Save tabs one by one to avoid overwhelming the server
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
                  resolve(); // Continue with other tabs even if one fails
                },
              },
            );
          });

          // Small delay to prevent overwhelming the server
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

      // Close tabs after all saves are complete
      if (savedTabIds.length > 0) {
        console.log(
          "💾 Bulk save completed. Attempting to close tabs:",
          savedTabIds,
        );
        await closeTabsHelper(savedTabIds);
      }

      // Bulk save completed
      console.log(
        "📊 Bulk save summary - total tabs:",
        tabsToSave.length,
        "completed:",
        completed,
        "savedTabIds:",
        savedTabIds,
      );
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
    },
    [allTabs, currentWindowTabs, createBookmark, closeTabs],
  );

  useEffect(() => {
    // Don't do anything if settings are still loading
    if (isSettingsLoading) {
      return;
    }

    // Don't do anything if settings aren't configured
    if (!settings.apiKey || !settings.address) {
      return;
    }

    async function prepareBookmarkData() {
      let newBookmarkRequest = null;

      // Check if there's a bookmark request from background script (e.g., context menu)
      const { [NEW_BOOKMARK_REQUEST_KEY_NAME]: req } =
        await chrome.storage.session.get(NEW_BOOKMARK_REQUEST_KEY_NAME);

      if (req) {
        // Delete the request immediately to avoid issues with lingering values
        await chrome.storage.session.remove(NEW_BOOKMARK_REQUEST_KEY_NAME);

        // Check if it's a bulk save request from context menu
        if (req.type === "BULK_SAVE_ALL_TABS") {
          // Set flag to trigger bulk save (default to current window)
          setShouldTriggerBulkSave(true);
          return;
        }

        newBookmarkRequest = zNewBookmarkRequestSchema.parse(req);
      } else {
        // Get current tab info
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

      // Get all tabs for bulk save functionality
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

      // Get current window tabs for window-specific bulk save
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

      // If auto-save is enabled, save immediately
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

  // Handle bulk save trigger from context menu
  useEffect(() => {
    if (
      shouldTriggerBulkSave &&
      (currentWindowTabs.length > 0 || allTabs.length > 0) &&
      !bulkSaveStatus.isActive
    ) {
      setShouldTriggerBulkSave(false);
      // Default to current window save, fallback to all tabs if current window has no valid tabs
      handleBulkSave(currentWindowTabs.length > 0 ? "window" : "all");
    }
  }, [
    shouldTriggerBulkSave,
    currentWindowTabs,
    allTabs,
    bulkSaveStatus.isActive,
    handleBulkSave,
  ]);

  const handleManualSave = () => {
    if (bookmarkRequest) {
      createBookmark(bookmarkRequest);
    }
  };

  // Show loading while settings are being loaded
  if (isSettingsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  // If settings aren't configured, the Layout component should handle the redirect
  // But in case we get here, show a message
  if (!settings.apiKey || !settings.address) {
    return (
      <div className="py-4 text-center">
        <p className="text-gray-600">Extension not configured.</p>
        <p className="text-sm text-gray-500">Please check your settings.</p>
      </div>
    );
  }

  // If bulk save is active, show progress
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

  // If bulk save completed with results, show summary
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
                    {bulkSaveStatus.errors.slice(0, 3).map((error, i) => (
                      <div key={i} className="mb-1 truncate">
                        {error}
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
      // If auto-save is disabled, show manual save interface
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

                {(currentWindowTabs.length > 1 ||
                  allTabs.length > currentWindowTabs.length) && (
                  <div className="mb-3 flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="closeTabs"
                      checked={closeTabs}
                      onChange={(e) => {
                        console.log(
                          "Close tabs checkbox changed to:",
                          e.target.checked,
                        );
                        setCloseTabs(e.target.checked);
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <label
                      htmlFor="closeTabs"
                      className="text-sm text-gray-700"
                    >
                      Close tabs after saving
                    </label>
                  </div>
                )}

                {currentWindowTabs.length > 1 && (
                  <Button
                    onClick={() => handleBulkSave("window")}
                    variant="outline"
                    className="mb-2 w-full"
                    disabled={currentWindowTabs.length === 0}
                  >
                    Save Current Window Tabs ({currentWindowTabs.length})
                  </Button>
                )}

                {allTabs.length > currentWindowTabs.length && (
                  <Button
                    onClick={() => handleBulkSave("all")}
                    variant="outline"
                    className="w-full"
                    disabled={allTabs.length === 0}
                  >
                    Save All Open Tabs ({allTabs.length})
                  </Button>
                )}
              </>
            )}

            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
        );
      } else {
        // Auto-save is enabled, but still show bulk save option
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
                <div className="mb-3 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="closeTabsAuto"
                    checked={closeTabs}
                    onChange={(e) => {
                      console.log(
                        "Close tabs checkbox (auto) changed to:",
                        e.target.checked,
                      );
                      setCloseTabs(e.target.checked);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <label
                    htmlFor="closeTabsAuto"
                    className="text-sm text-gray-700"
                  >
                    Close tabs after saving
                  </label>
                </div>

                {currentWindowTabs.length > 1 && (
                  <Button
                    onClick={() => handleBulkSave("window")}
                    variant="outline"
                    className="w-full"
                    disabled={currentWindowTabs.length === 0}
                  >
                    Save Current Window Tabs ({currentWindowTabs.length})
                  </Button>
                )}

                {allTabs.length > currentWindowTabs.length && (
                  <Button
                    onClick={() => handleBulkSave("all")}
                    variant="outline"
                    className="w-full"
                    disabled={allTabs.length === 0}
                  >
                    Save All Open Tabs ({allTabs.length})
                  </Button>
                )}
              </div>
            )}

            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
        );
      }
    }
  }
}
