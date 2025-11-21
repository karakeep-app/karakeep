/**
 * Content script for capturing page content using SingleFile
 */

import { getPageData, init } from "./single-file.js";

// Initialize SingleFile
init({});

// Listen for messages from the extension popup/background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CAPTURE_PAGE") {
    captureCurrentPage()
      .then((html) => {
        sendResponse({ success: true, html });
      })
      .catch((error) => {
        console.error("Failed to capture page:", error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    // Return true to indicate we'll send a response asynchronously
    return true;
  }
});

async function captureCurrentPage(): Promise<string> {
  try {
    const pageData = await getPageData(
      {
        removeHiddenElements: true,
        removeUnusedStyles: true,
        removeUnusedFonts: true,
        compressHTML: true,
        removeImports: true,
        removeScripts: true,
        removeAudioSrc: false,
        removeVideoSrc: false,
        removeAlternativeFonts: true,
        removeAlternativeMedias: true,
        removeAlternativeImages: true,
        groupDuplicateImages: true,
        maxResourceSizeEnabled: true,
        maxResourceSize: 10,
      },
      {},
      document,
      window,
    );
    return pageData.content;
  } catch (error) {
    console.error("Error capturing page with SingleFile:", error);
    throw error;
  }
}
