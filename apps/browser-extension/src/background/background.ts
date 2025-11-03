import {
  BookmarkTypes,
  ZNewBookmarkRequest,
} from "@karakeep/shared/types/bookmarks";

import { clearBadgeStatus, getBadgeStatus } from "../utils/badgeCache";
import {
  getPluginSettings,
  Settings,
  subscribeToSettingsChanges,
} from "../utils/settings";
import { getApiClient, initializeClients } from "../utils/trpc";
import { MessageType } from "../utils/type";
import { isHttpUrl } from "../utils/url";
import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./protocol";

const OPEN_KARAKEEP_ID = "open-karakeep";
const ADD_LINK_TO_KARAKEEP_ID = "add-link";
const CLEAR_CURRENT_CACHE_ID = "clear-current-cache";
const CLEAR_ALL_CACHE_ID = "clear-all-cache";
const SEPARATOR_ID = "separator-1";
const VIEW_PAGE_IN_KARAKEEP = "view-page-in-karakeep";

/**
 * Check the current settings state and register or remove context menus accordingly.
 * @param settings The current plugin settings.
 */
async function checkSettingsState(settings: Settings) {
  await initializeClients();
  if (settings?.address && settings?.apiKey) {
    registerContextMenus(settings);
  } else {
    removeContextMenus();
    await clearAllCache();
  }
}

/**
 * Remove context menus from the browser.
 */
function removeContextMenus() {
  try {
    chrome.contextMenus.removeAll();
  } catch (error) {
    console.error("Failed to remove context menus:", error);
  }
}

/**
 * Register context menus in the browser.
 * * A context menu button to open a tab with the currently configured karakeep instance.
 * * * If the "show count badge" setting is enabled, add context menu buttons to clear the cache for the current page or all pages.
 * * A context menu button to add a link to karakeep without loading the page.
 * @param settings The current plugin settings.
 */
function registerContextMenus(settings: Settings) {
  removeContextMenus();
  chrome.contextMenus.create({
    id: OPEN_KARAKEEP_ID,
    title: "Open Karakeep",
    contexts: ["action"],
  });

  chrome.contextMenus.create({
    id: ADD_LINK_TO_KARAKEEP_ID,
    title: "Add to Karakeep",
    contexts: ["link", "page", "selection", "image"],
  });

  if (settings?.showCountBadge) {
    chrome.contextMenus.create({
      id: VIEW_PAGE_IN_KARAKEEP,
      title: "View this page in Karakeep",
      contexts: ["action", "page"],
    });
    if (settings?.useBadgeCache) {
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
  }
}

/**
 * Handle context menu clicks by opening a new tab with karakeep or adding a link to karakeep.
 * @param info Information about the context menu click event.
 * @param tab The current tab.
 */
async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
) {
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
    addLinkToKarakeep({
      selectionText,
      srcUrl,
      linkUrl,
      pageUrl,
      title: tab?.title,
    });

    // NOTE: Firefox only allows opening context menus if it's triggered by a user action.
    // awaiting on any promise before calling this function will lose the "user action" context.
    await chrome.action.openPopup();
  } else if (menuItemId === VIEW_PAGE_IN_KARAKEEP) {
    if (tab) {
      await searchCurrentUrl(tab.url);
    }
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
  title,
}: {
  selectionText?: string;
  srcUrl?: string;
  linkUrl?: string;
  pageUrl?: string;
  title?: string;
}) {
  let newBookmark: ZNewBookmarkRequest | null = null;
  if (selectionText) {
    newBookmark = {
      type: BookmarkTypes.TEXT,
      text: selectionText,
      sourceUrl: pageUrl,
      source: "extension",
    };
  } else {
    const finalUrl = srcUrl ?? linkUrl ?? pageUrl;

    if (finalUrl && isHttpUrl(finalUrl)) {
      newBookmark = {
        type: BookmarkTypes.LINK,
        url: finalUrl,
        source: "extension",
        title,
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
 * Search current URL and open appropriate page.
 */
async function searchCurrentUrl(tabUrl?: string) {
  try {
    if (!tabUrl || !isHttpUrl(tabUrl)) {
      console.warn("Invalid URL, cannot search:", tabUrl);
      return;
    }
    console.log("Searching bookmarks for URL:", tabUrl);

    const settings = await getPluginSettings();
    const serverAddress = settings.address;

    const matchedBookmarkId = await getBadgeStatus(tabUrl);
    let targetUrl: string;
    if (matchedBookmarkId) {
      // Found exact match, open bookmark details page
      targetUrl = `${serverAddress}/dashboard/preview/${matchedBookmarkId}`;
      console.log("Opening bookmark details page:", targetUrl);
    } else {
      // No exact match, open search results page
      const searchQuery = encodeURIComponent(`url:${tabUrl}`);
      targetUrl = `${serverAddress}/dashboard/search?q=${searchQuery}`;
      console.log("Opening search results page:", targetUrl);
    }
    await chrome.tabs.create({ url: targetUrl, active: true });
  } catch (error) {
    console.error("Failed to search current URL:", error);
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
      await clearBadgeStatus(activeTab.url);

      // Refresh the badge for the current tab
      await checkAndUpdateIcon(activeTab.id);
    }
  } catch (error) {
    console.error("Failed to clear current page cache:", error);
  }
}

/**
 * Clear all badge cache and refresh badges for all active tabs.
 */
async function clearAllCache() {
  try {
    console.log("Clearing all badge cache");
    await clearBadgeStatus();
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
 * @param badgeStatus
 * @param tabId The ID of the tab to update.
 */
export async function setBadge(badgeStatus: string | null, tabId?: number) {
  if (!tabId) return;

  if (badgeStatus) {
    return await Promise.all([
      chrome.action.setBadgeText({ tabId, text: ` ` }),
      chrome.action.setBadgeBackgroundColor({
        tabId,
        color: "#4CAF50",
      }),
    ]);
  } else {
    await chrome.action.setBadgeText({ tabId, text: `` });
  }
}

/**
 * Check and update the badge icon for a given tab ID.
 * @param tabId The ID of the tab to update.
 */
async function checkAndUpdateIcon(tabId: number) {
  const tabInfo = await chrome.tabs.get(tabId);
  const { showCountBadge } = await getPluginSettings();
  const api = await getApiClient();
  if (
    !api ||
    !showCountBadge ||
    !tabInfo.url ||
    !isHttpUrl(tabInfo.url) ||
    tabInfo.status !== "complete"
  ) {
    await chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }
  console.log("Tab activated", tabId, tabInfo);

  try {
    const status = await getBadgeStatus(tabInfo.url);
    await setBadge(status, tabId);
  } catch (error) {
    console.error("Archive check failed:", error);
    await setBadge(null, tabId);
  }
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
      if (msg.currentTab.url) {
        await clearBadgeStatus(msg.currentTab.url);
      }
      if (typeof msg.currentTab.id === "number") {
        await checkAndUpdateIcon(msg.currentTab.id);
      }
    }
  }
});
