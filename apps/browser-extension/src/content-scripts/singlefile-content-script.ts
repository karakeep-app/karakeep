/**
 * Content script for capturing page content using SingleFile
 */

import { getPageData, init } from "single-file-core/single-file.js";

declare global {
  interface Window {
    __karakeepSingleFileLoaded__?: boolean;
  }
}

if (window.__karakeepSingleFileLoaded__) {
  // Already registered in this page context — don't re-register listeners.
  // Using `throw` short-circuits re-injection cleanly.
  throw new Error("karakeep singlefile content script already loaded");
}
window.__karakeepSingleFileLoaded__ = true;

init({});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CAPTURE_PAGE") {
    captureCurrentPage({ blockImages: message.blockImages === true })
      .then((html) => sendResponse({ success: true, html }))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    // Return true to indicate we'll send a response asynchronously
    return true;
  }
});

async function captureCurrentPage(opts: {
  blockImages: boolean;
}): Promise<string> {
  const pageData = await getPageData(
    {
      removeHiddenElements: true,
      removeUnusedStyles: true,
      removeUnusedFonts: true,
      compressHTML: true,
      blockScripts: true,
      blockImages: opts.blockImages,
      removeFrames: true,
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
}
