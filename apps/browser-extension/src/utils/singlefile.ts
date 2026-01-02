/**
 * Utilities for SingleFile integration
 */

import { getPluginSettings } from "./settings";

/**
 * Capture the current page using SingleFile
 */
export async function capturePageWithSingleFile(
  tabId: number,
): Promise<string> {
  const response = await chrome.tabs.sendMessage(tabId, {
    type: "CAPTURE_PAGE",
  });

  if (!response.success) {
    throw new Error(response.error || "Failed to capture page");
  }

  return response.html;
}

/**
 * Upload HTML content as a file to the server and create a bookmark
 */
export async function uploadSingleFileAndCreateBookmark(
  url: string,
  html: string,
  title?: string,
): Promise<Response> {
  const settings = await getPluginSettings();

  // Create a File object from the HTML content
  const blob = new Blob([html], { type: "text/html" });
  const filename = sanitizeFilename(title || "page") + ".html";
  const file = new File([blob], filename, { type: "text/html" });

  // Create FormData
  const formData = new FormData();
  formData.append("url", url);
  formData.append("file", file);

  // Upload to the /v1/singlefile endpoint
  const apiUrl = `${settings.address}/api/v1/bookmarks/singlefile`;

  const headers: HeadersInit = {
    Authorization: `Bearer ${settings.apiKey}`,
  };

  // Add custom headers if configured
  if (settings.customHeaders) {
    Object.entries(settings.customHeaders).forEach(([key, value]) => {
      headers[key] = value;
    });
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload: ${response.status} ${errorText}`);
  }

  return response;
}

/**
 * Sanitize filename by removing invalid characters
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9-_\s]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}
