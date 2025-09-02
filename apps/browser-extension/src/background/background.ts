import {
  BookmarkTypes,
  ZNewBookmarkRequest,
} from "@karakeep/shared/types/bookmarks";

import {
  checkAndPurgeIfNeeded,
  clearBadgeStatusSWR,
  getBadgeStatusSWR,
  setBadgeStatusSWR,
} from "../utils/badgeCache";
import {
  getPluginSettings,
  Settings,
  subscribeToSettingsChanges,
} from "../utils/settings";
import { cleanupApiClient, getApiClient } from "../utils/trpc";
import { MessageType } from "../utils/type";
import { isHttpUrl } from "../utils/url";
import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./protocol";

const OPEN_KARAKEEP_ID = "open-karakeep";
const ADD_LINK_TO_KARAKEEP_ID = "add-link";
const CLEAR_CURRENT_CACHE_ID = "clear-current-cache";
const CLEAR_ALL_CACHE_ID = "clear-all-cache";
const SEPARATOR_ID = "separator-1";

/**
 * Check the current settings state and register or remove context menus accordingly.
 * @param settings The current plugin settings.
 */
async function checkSettingsState(settings: Settings) {
  if (settings?.address && settings?.apiKey) {
    registerContextMenus(settings);
  } else {
    removeContextMenus();
    cleanupApiClient();
    await clearBadgeStatusSWR();
  }
}

/**
 * Remove context menus from the browser.
 */
function removeContextMenus() {
  chrome.contextMenus.removeAll();
}

/**
 * Register context menus in the browser.
 * * A context menu button to open a tab with the currently configured karakeep instance.
 * * * If the "show count badge" setting is enabled, add context menu buttons to clear the cache for the current page or all pages.
 * * A context menu button to add a link to karakeep without loading the page.
 * @param settings The current plugin settings.
 */
function registerContextMenus(settings: Settings) {
  chrome.contextMenus.create({
    id: OPEN_KARAKEEP_ID,
    title: "Open Karakeep",
    contexts: ["action"],
  });

  if (settings?.showCountBadge) {
    // Add separator
    chrome.contextMenus.create({
      id: SEPARATOR_ID,
      type: "separator",
      contexts: ["action"],
    });

    chrome.contextMenus.create({
      id: CLEAR_CURRENT_CACHE_ID,
      title: "Clear Current Page Cache",
      contexts: ["action"],
    });

    chrome.contextMenus.create({
      id: CLEAR_ALL_CACHE_ID,
      title: "Clear All Cache",
      contexts: ["action"],
    });
  }

  chrome.contextMenus.create({
    id: ADD_LINK_TO_KARAKEEP_ID,
    title: "Add to Karakeep",
    contexts: ["link", "page", "selection", "image"],
  });
}

/**
 * Handle context menu clicks by opening a new tab with karakeep or adding a link to karakeep.
 * @param info Information about the context menu click event.
 */
async function handleContextMenuClick(info: chrome.contextMenus.OnClickData) {
  const { menuItemId, selectionText, srcUrl, linkUrl, pageUrl } = info;
  if (menuItemId === OPEN_KARAKEEP_ID) {
    getPluginSettings().then((settings: Settings) => {
      chrome.tabs.create({ url: settings.address, active: true });
    });
  } else if (menuItemId === CLEAR_CURRENT_CACHE_ID) {
    await clearCurrentPageCache();
  } else if (menuItemId === CLEAR_ALL_CACHE_ID) {
    await clearAllCache();
  } else if (menuItemId === ADD_LINK_TO_KARAKEEP_ID) {
    addLinkToKarakeep({ selectionText, srcUrl, linkUrl, pageUrl });

    // NOTE: Firefox only allows opening context menus if it's triggered by a user action.
    // awaiting on any promise before calling this function will lose the "user action" context.
    await chrome.action.openPopup();
  }
}

/**
 * Add a link to karakeep based on the provided information.
 * @param options An object containing information about the link to add.
 */
function addLinkToKarakeep({
  selectionText,
  srcUrl,
  linkUrl,
  pageUrl,
}: {
  selectionText?: string;
  srcUrl?: string;
  linkUrl?: string;
  pageUrl?: string;
}) {
  let newBookmark: ZNewBookmarkRequest | null = null;
  if (selectionText) {
    newBookmark = {
      type: BookmarkTypes.TEXT,
      text: selectionText,
      sourceUrl: pageUrl,
    };
  } else {
    const finalUrl = srcUrl ?? linkUrl ?? pageUrl;

    if (finalUrl && isHttpUrl(finalUrl)) {
      newBookmark = {
        type: BookmarkTypes.LINK,
        url: finalUrl,
      };
    } else {
      console.warn("Invalid URL, bookmark not created:", finalUrl);
    }
  }
  if (newBookmark) {
    chrome.storage.session.set({
      [NEW_BOOKMARK_REQUEST_KEY_NAME]: newBookmark,
    });
  }
}

/**
 * Clear badge cache for the current active page.
 */
async function clearCurrentPageCache() {
  try {
    // Get the active tab
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (activeTab.url && activeTab.id) {
      console.log("Clearing cache for current page:", activeTab.url);
      await clearBadgeStatusSWR(activeTab.url);

      // Refresh the badge for the current tab
      await checkAndUpdateIcon(activeTab.id);
    }
  } catch (error) {
    console.error("Failed to clear current page cache:", error);
  }
}

/**
 * Clear all badge cache.
 */
async function clearAllCache() {
  try {
    console.log("Clearing all badge cache");
    await clearBadgeStatusSWR();
  } catch (error) {
    console.error("Failed to clear all cache:", error);
  }
}

getPluginSettings().then(async (settings: Settings) => {
  await checkSettingsState(settings);
});

subscribeToSettingsChanges(async (settings) => {
  await checkSettingsState(settings);
});

// eslint-disable-next-line @typescript-eslint/no-misused-promises -- Manifest V3 allows async functions for all callbacks
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

/**
 * Handle command events, such as adding a link to karakeep.
 * @param command The command to handle.
 * @param tab The current tab.
 */
function handleCommand(command: string, tab: chrome.tabs.Tab) {
  if (command === ADD_LINK_TO_KARAKEEP_ID) {
    addLinkToKarakeep({
      selectionText: undefined,
      srcUrl: undefined,
      linkUrl: undefined,
      pageUrl: tab?.url,
    });

    // now try to open the popup
    chrome.action.openPopup();
  } else {
    console.warn(`Received unknown command: ${command}`);
  }
}

chrome.commands.onCommand.addListener(handleCommand);

/**
 * Set the badge text and color based on the provided information.
 * @param text The text to display on the badge.
 * @param isExisted Whether the badge should indicate existence.
 * @param tabId The ID of the tab to update.
 */
export async function setBadge(
  text: string | number,
  isExisted: boolean,
  tabId?: number,
) {
  return await Promise.all([
    chrome.action.setBadgeText({ tabId, text: `${text}` }),
    chrome.action.setBadgeBackgroundColor({
      tabId,
      color: isExisted ? "#4CAF50" : "#F44336",
    }),
  ]);
}

/**
 * Get the count of bookmarks for a given tab URL.
 * @param tabUrl The URL of the tab to check.
 */
export async function getTabCount(tabUrl: string) {
  const api = await getApiClient();
  const data = await api.bookmarks.searchBookmarks.query({
    text: "url:" + tabUrl,
  });
  if (!data) {
    return { count: 0, isExisted: false };
  }
  const bookmarks = data.bookmarks || [];
  const isExisted = bookmarks.some(
    (b) => b.content.type === BookmarkTypes.LINK && tabUrl === b.content.url,
  );
  return {
    count: bookmarks.length,
    isExisted,
  };
}

/**
 * Check and update the badge icon for a given tab ID.
 * @param tabId The ID of the tab to update.
 */
async function checkAndUpdateIcon(tabId: number) {
  const tabInfo = await chrome.tabs.get(tabId);
  const pluginSettings = await getPluginSettings();
  if (
    !pluginSettings.showCountBadge ||
    !tabInfo.url ||
    !isHttpUrl(tabInfo.url) ||
    tabInfo.status !== "complete"
  ) {
    return;
  }
  console.log("Tab activated", tabId, tabInfo);

  try {
    const cachedInfo = await getBadgeStatusSWR(tabInfo.url);
    if (cachedInfo) {
      const { count: cachedBadgeCount, isExisted: cachedIsExisted } =
        cachedInfo;
      await setBadge(cachedBadgeCount, cachedIsExisted, tabId);
      return;
    }
    const { count, isExisted } = await getTabCount(tabInfo.url);
    await setBadge(count, isExisted, tabId);
    await setBadgeStatusSWR(tabInfo.url, count, isExisted);
  } catch (error) {
    console.error("Archive check failed:", error);
    await setBadge("!", false, tabId);
  }
  // Check if we need to purge stale cache entries
  await checkAndPurgeIfNeeded();
}

chrome.tabs.onActivated.addListener(async (tabActiveInfo) => {
  await checkAndUpdateIcon(tabActiveInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId) => {
  await checkAndUpdateIcon(tabId);
});

// Listen for REFRESH_BADGE messages from popup and update badge accordingly
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg && msg.type) {
    if (msg.currentTab && msg.type === MessageType.BOOKMARK_REFRESH_BADGE) {
      console.log(
        "Received REFRESH_BADGE message for tab:",
        msg.currentTab.url,
      );
      await clearBadgeStatusSWR(msg.currentTab.url);
      await checkAndUpdateIcon(msg.currentTab.id);
    }
  }
});
