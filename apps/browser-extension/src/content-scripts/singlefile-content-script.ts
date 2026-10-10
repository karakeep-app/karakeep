/**
 * Content script for capturing page content using SingleFile
 */

import { getPageData, init } from "single-file-core/single-file.js";

declare global {
  interface Window {
    __karakeepSingleFileLoaded__?: boolean;
  }
}

if (!window.__karakeepSingleFileLoaded__) {
  init({});
  let capturing = false;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "CAPTURE_READY") {
      sendResponse({ ready: true });
      return;
    }
    if (message?.type !== "CAPTURE_PAGE") return;
    const url = location.href;
    if (message.expectedUrl !== url || capturing) {
      sendResponse({
        success: false,
        error: capturing
          ? "A page capture is still running. Wait before retrying, or reload the page."
          : "The page changed before capture. Reopen the extension.",
      });
      return;
    }
    capturing = true;
    captureCurrentPage({ blockImages: message.blockImages === true })
      .then((html) => {
        if (location.href !== url)
          throw new Error("The page changed during capture.");
        sendResponse({ success: true, html, url });
      })
      .catch((error) =>
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      .finally(() => {
        capturing = false;
      });
    // Return true to indicate we'll send a response asynchronously
    return true;
  });
  window.__karakeepSingleFileLoaded__ = true;
}

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
      networkTimeout: 10_000,
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
