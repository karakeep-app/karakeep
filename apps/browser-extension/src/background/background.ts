import {
  BookmarkTypes,
  ZNewBookmarkRequest,
} from "@karakeep/shared/types/bookmarks.ts";

import {
  getPluginSettings,
  Settings,
  subscribeToSettingsChanges,
} from "../utils/settings.ts";
import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./protocol.ts";

const OPEN_KARAKEEP_ID = "open-karakeep";
const ADD_LINK_TO_KARAKEEP_ID = "add-link";
const SAVE_ALL_TABS_ID = "save-all-tabs";

let contextMenusRegistered = false;
let isRegistering = false;

async function checkSettingsState(settings: Settings) {
  if (settings?.address) {
    await registerContextMenus();
  } else {
    await removeContextMenus();
  }
}

async function removeContextMenus() {
  if (!contextMenusRegistered && !isRegistering) {
    return;
  }

  return new Promise<void>((resolve) => {
    try {
      chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
          console.log(
            "Context menus removal:",
            chrome.runtime.lastError.message,
          );
        }
        contextMenusRegistered = false;
        isRegistering = false;
        resolve();
      });
    } catch (error) {
      console.log("Error removing context menus:", error);
      contextMenusRegistered = false;
      isRegistering = false;
      resolve();
    }
  });
}

/**
 * Registers
 * * a context menu button to open a tab with the currently configured karakeep instance
 * * a context menu button to add a link to karakeep without loading the page
 */
async function registerContextMenus() {
  if (contextMenusRegistered || isRegistering) {
    return;
  }

  isRegistering = true;

  await removeContextMenus();

  try {
    await createContextMenu({
      id: OPEN_KARAKEEP_ID,
      title: "Open Karakeep",
      contexts: ["action"],
    });

    await createContextMenu({
      id: ADD_LINK_TO_KARAKEEP_ID,
      title: "Add to Karakeep",
      contexts: ["link", "page", "selection", "image"],
    });

    await createContextMenu({
      id: SAVE_ALL_TABS_ID,
      title: "Save All Tabs in Window",
      contexts: ["action"],
    });

    contextMenusRegistered = true;
    isRegistering = false;
    console.log("All context menus registered successfully");
  } catch (error) {
    console.error("Error registering context menus:", error);
    contextMenusRegistered = false;
    isRegistering = false;
  }
}

function createContextMenu(
  properties: chrome.contextMenus.CreateProperties,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      chrome.contextMenus.create(properties, () => {
        if (chrome.runtime.lastError) {
          console.error(
            `Error creating ${properties.id} menu:`,
            chrome.runtime.lastError.message,
          );
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log(`Successfully created ${properties.id} menu`);
          resolve();
        }
      });
    } catch (error) {
      console.error(`Exception creating ${properties.id} menu:`, error);
      reject(error);
    }
  });
}

/**
 * Reads the current settings and opens a new tab with karakeep
 * @param info the information about the click in the context menu
 */
async function handleContextMenuClick(info: chrome.contextMenus.OnClickData) {
  const { menuItemId, selectionText, srcUrl, linkUrl, pageUrl } = info;

  try {
    if (menuItemId === OPEN_KARAKEEP_ID) {
      const settings = await getPluginSettings();
      if (settings.address) {
        chrome.tabs.create({ url: settings.address, active: true });
      }
    } else if (menuItemId === ADD_LINK_TO_KARAKEEP_ID) {
      addLinkToKarakeep({ selectionText, srcUrl, linkUrl, pageUrl });
      await openPopupSafely();
    } else if (menuItemId === SAVE_ALL_TABS_ID) {
      await chrome.storage.session.set({
        [NEW_BOOKMARK_REQUEST_KEY_NAME]: { type: "BULK_SAVE_ALL_TABS" },
      });
      await openPopupSafely();
    }
  } catch (error) {
    console.error("Error handling context menu click:", error);
  }
}

async function openPopupSafely() {
  try {
    await chrome.action.openPopup();
  } catch (error) {
    console.log("Could not open popup:", error);
    try {
      const url = chrome.runtime.getURL("index.html#/");
      await chrome.windows.create({
        url,
        type: "popup",
        width: 400,
        height: 600,
      });
    } catch (windowError) {
      console.error("Could not open popup window either:", windowError);
    }
  }
}

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
  } else if (srcUrl ?? linkUrl ?? pageUrl) {
    newBookmark = {
      type: BookmarkTypes.LINK,
      url: srcUrl ?? linkUrl ?? pageUrl ?? "",
    };
  }
  if (newBookmark) {
    chrome.storage.session.set({
      [NEW_BOOKMARK_REQUEST_KEY_NAME]: newBookmark,
    });
  }
}

function handleCommand(command: string, tab: chrome.tabs.Tab) {
  if (command === ADD_LINK_TO_KARAKEEP_ID) {
    addLinkToKarakeep({
      selectionText: undefined,
      srcUrl: undefined,
      linkUrl: undefined,
      pageUrl: tab?.url,
    });
    openPopupSafely();
  } else {
    console.warn(`Received unknown command: ${command}`);
  }
}

// Initialize extension
(async () => {
  try {
    const settings = await getPluginSettings();
    await checkSettingsState(settings);
  } catch (error) {
    console.error("Error initializing extension:", error);
  }
})();

// Listen for settings changes
subscribeToSettingsChanges(checkSettingsState);

// Listen for context menu clicks
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// Listen for keyboard commands
chrome.commands.onCommand.addListener(handleCommand);
