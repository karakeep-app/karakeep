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

let isRegistering = false;

async function checkSettingsState(settings: Settings) {
  if (settings?.address) {
    await registerContextMenus();
  } else {
    await removeContextMenus();
  }
}

function removeContextMenus(): Promise<void> {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      // Clear all context menus to avoid any conflicts
      if (chrome.runtime.lastError) {
        // Ignore errors when removing non-existent menu items
      }
      // Add a small delay to ensure removal is fully processed
      setTimeout(resolve, 10);
    });
  });
}

/**
 * Registers
 * * a context menu button to open a tab with the currently configured karakeep instance
 * * a context menu button to add a link to karakeep without loading the page
 */
async function registerContextMenus() {
  if (isRegistering) {
    console.log("Already registering context menus, skipping...");
    return;
  }

  isRegistering = true;
  console.log("Registering context menus...");

  try {
    // First remove any existing menus to avoid duplicates
    await removeContextMenus();
    console.log("Context menus removed, creating new ones...");

    // Then create the new ones
    // Create "Open Karakeep" menu item that appears on pages
    chrome.contextMenus.create(
      {
        id: OPEN_KARAKEEP_ID,
        title: "Open Karakeep",
        contexts: ["page"],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Failed to create Open Karakeep menu:",
            chrome.runtime.lastError.message,
          );
        } else {
          console.log("Successfully created Open Karakeep menu");
        }
      },
    );

    chrome.contextMenus.create(
      {
        id: ADD_LINK_TO_KARAKEEP_ID,
        title: "Add to Karakeep",
        contexts: ["link", "page", "selection", "image"],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Failed to create Add to Karakeep menu:",
            chrome.runtime.lastError.message,
          );
        } else {
          console.log("Successfully created Add to Karakeep menu");
        }
      },
    );
  } finally {
    // Reset the flag after a delay to allow for future registrations
    setTimeout(() => {
      isRegistering = false;
    }, 1000);
  }
}

/**
 * Reads the current settings and opens a new tab with karakeep
 * @param info the information about the click in the context menu
 */
async function handleContextMenuClick(info: chrome.contextMenus.OnClickData) {
  const { menuItemId, selectionText, srcUrl, linkUrl, pageUrl } = info;
  if (menuItemId === OPEN_KARAKEEP_ID) {
    getPluginSettings().then((settings: Settings) => {
      chrome.tabs.create({ url: settings.address, active: true });
    });
  } else if (menuItemId === ADD_LINK_TO_KARAKEEP_ID) {
    addLinkToKarakeep({ selectionText, srcUrl, linkUrl, pageUrl });

    // NOTE: Firefox only allows opening context menus if it's triggered by a user action.
    // awaiting on any promise before calling this function will lose the "user action" context.
    await chrome.action.openPopup();
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

getPluginSettings().then((settings: Settings) => {
  checkSettingsState(settings).catch(console.error);
});

subscribeToSettingsChanges((settings) => {
  checkSettingsState(settings).catch(console.error);
});

// eslint-disable-next-line @typescript-eslint/no-misused-promises -- Manifest V3 allows async functions for all callbacks
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

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
