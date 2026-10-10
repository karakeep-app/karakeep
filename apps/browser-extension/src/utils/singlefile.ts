/**
 * Utilities for SingleFile integration
 */

import type { Settings } from "./settings";

const CAPTURE_TIMEOUT_MS = 60_000;

/**
 * Capture the current page using SingleFile
 */
export async function capturePageWithSingleFile(
  tabId: number,
  opts: { includeImages: boolean; expectedUrl: string },
): Promise<string> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url !== opts.expectedUrl) {
    throw new Error(
      "The page changed. Reopen the extension on the page you want to save.",
    );
  }
  if (!(await isCaptureReady(tabId))) {
    await injectSingleFileContentScript(tabId);
  }
  const response = await withTimeout(
    chrome.tabs.sendMessage(
      tabId,
      {
        type: "CAPTURE_PAGE",
        blockImages: !opts.includeImages,
        expectedUrl: opts.expectedUrl,
      },
      { frameId: 0 },
    ),
    CAPTURE_TIMEOUT_MS,
    "Page capture timed out. Try again with images disabled.",
  );
  if (!response?.success) {
    throw new Error(response?.error || "Failed to capture page");
  }
  if (
    response.url !== opts.expectedUrl ||
    (await chrome.tabs.get(tabId)).url !== opts.expectedUrl
  ) {
    throw new Error("The page changed during capture. Please try again.");
  }
  if (typeof response.html !== "string" || !response.html.trim()) {
    throw new Error("The page returned an empty capture.");
  }

  return response.html;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function isCaptureReady(tabId: number): Promise<boolean> {
  try {
    const response = await withTimeout(
      chrome.tabs.sendMessage(tabId, { type: "CAPTURE_READY" }, { frameId: 0 }),
      500,
      "Capture script did not respond",
    );
    return response?.ready === true;
  } catch {
    return false;
  }
}

async function injectSingleFileContentScript(tabId: number): Promise<void> {
  const contentScripts = chrome.runtime.getManifest().content_scripts;
  const files = contentScripts?.find((cs) =>
    cs.js?.some((f) => f.includes("singlefile-content-script")),
  )?.js;
  if (!files || files.length === 0) {
    throw new Error("SingleFile content script not declared in manifest");
  }
  // The manifest points to CRXJS's classic loader, which imports the module
  // bundle itself. Execute the loader and wait for the listener below.
  await withTimeout(
    chrome.scripting.executeScript({ target: { tabId }, files }),
    10_000,
    "Could not inject the capture script. Check this site's extension permission.",
  );
  // CRXJS's manifest entry can be a loader that starts an asynchronous import.
  // Importing that loader is not proof that the message listener is ready.
  const deadline = Date.now() + 5_000;
  do {
    if (await isCaptureReady(tabId)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error(
    "The capture script could not start. Check this site's extension permission.",
  );
}

/**
 * Upload the captured HTML as an asset and return the asset id.
 */
export async function uploadSingleFileAsset(
  html: string,
  settings: Pick<Settings, "address" | "apiKey" | "customHeaders">,
  title?: string,
): Promise<string> {
  const blob = new Blob([html], { type: "text/html" });
  const filename = sanitizeFilename(title || "page") + ".html";
  const file = new File([blob], filename, { type: "text/html" });

  const formData = new FormData();
  formData.append("file", file);

  const apiUrl = `${settings.address}/api/assets`;

  const headers: HeadersInit = {
    Authorization: `Bearer ${settings.apiKey}`,
  };

  if (settings.customHeaders) {
    Object.entries(settings.customHeaders).forEach(([key, value]) => {
      headers[key] = value;
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: formData,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to upload page (HTTP ${response.status}).`);
    }
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("assetId" in data) ||
      typeof data.assetId !== "string" ||
      !data.assetId
    ) {
      throw new Error("The server did not return an archive ID.");
    }
    return data.assetId;
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9-_\s]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}
