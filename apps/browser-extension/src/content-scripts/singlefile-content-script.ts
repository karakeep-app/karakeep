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
      // When images are blocked, SingleFile wipes `srcset` and skips `src`
      // rewriting. Ask it to stash the originals on `data-sf-original-*` so
      // we can restore them below.
      saveOriginalURLs: opts.blockImages,
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
  return opts.blockImages
    ? restoreOriginalImageUrls(pageData.content)
    : pageData.content;
}

function restoreOriginalImageUrls(html: string): string {
  // Move `data-sf-original-src` / `data-sf-original-srcset` back onto the
  // element as `src` / `srcset` so images load from origin in the viewer.
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const attr of ["src", "srcset"] as const) {
    const dataAttr = `data-sf-original-${attr}`;
    doc.querySelectorAll(`[${dataAttr}]`).forEach((el) => {
      const v = el.getAttribute(dataAttr);
      if (v) el.setAttribute(attr, v);
      el.removeAttribute(dataAttr);
    });
  }
  return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}
