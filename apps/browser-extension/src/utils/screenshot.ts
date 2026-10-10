/**
 * Utilities for capturing and uploading a screenshot of the active tab,
 * used by the "Screenshot and send to Karakeep" context menu item.
 */

import { sanitizeFilename, uploadAssetFile } from "./assetUpload";

/**
 * Capture a PNG screenshot of the currently visible area of the active tab
 * in the given window. Relies on the `activeTab` permission, which is
 * granted for the tab the user just interacted with (e.g. via the context
 * menu click that triggers this).
 */
export async function captureVisibleTabScreenshot(
  windowId: number,
): Promise<string> {
  return await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
}

/**
 * Upload a data-URL screenshot (as produced by captureVisibleTabScreenshot)
 * as a Karakeep image asset and return the resulting asset id.
 */
export async function uploadScreenshotAsset(
  dataUrl: string,
  title?: string,
): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const filename = sanitizeFilename(title || "screenshot") + ".png";
  const file = new File([blob], filename, { type: "image/png" });
  return uploadAssetFile(file);
}
