/**
 * Utilities for SingleFile integration
 */

import { getPluginSettings } from "./settings";

const CAPTURE_TIMEOUT_MS = 60_000;

/**
 * Capture the current page using SingleFile
 */
export async function capturePageWithSingleFile(
  tabId: number,
  opts: { includeImages: boolean },
): Promise<string> {
  const blockImages = !opts.includeImages;
  let response;
  try {
    response = await sendCaptureMessage(tabId, blockImages);
  } catch (e) {
    // Content script not yet present in the tab (e.g. page loaded before the
    // extension was installed or the browser was restarted). Inject on demand
    // and retry.
    const msg = e instanceof Error ? e.message : String(e);
    if (
      !/Could not establish connection|Receiving end does not exist/i.test(msg)
    ) {
      throw e;
    }
    await injectSingleFileContentScript(tabId);
    response = await sendCaptureMessage(tabId, blockImages);
  }

  if (!response.success) {
    throw new Error(response.error || "Failed to capture page");
  }

  return response.html;
}

async function sendCaptureMessage(
  tabId: number,
  blockImages: boolean,
): Promise<{ success: boolean; html: string; error?: string }> {
  return await Promise.race([
    chrome.tabs.sendMessage(tabId, { type: "CAPTURE_PAGE", blockImages }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`Capture timed out after ${CAPTURE_TIMEOUT_MS / 1000}s`),
          ),
        CAPTURE_TIMEOUT_MS,
      ),
    ),
  ]);
}

async function injectSingleFileContentScript(tabId: number): Promise<void> {
  const contentScripts = chrome.runtime.getManifest().content_scripts;
  const files = contentScripts?.find((cs) =>
    cs.js?.some((f) => f.includes("singlefile-content-script")),
  )?.js;
  if (!files || files.length === 0) {
    throw new Error("SingleFile content script not declared in manifest");
  }
  // The bundle is an ES module (crxjs emits chunks with `import.meta`), so
  // `executeScript({ files })` — which loads as a classic script — fails.
  // Use a dynamic import in the isolated world instead.
  const urls = files.map((f) => chrome.runtime.getURL(f));
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (moduleUrls: string[]) => {
      try {
        for (const url of moduleUrls) {
          await import(/* @vite-ignore */ url);
        }
        return { ok: true as const };
      } catch (e) {
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
    args: [urls],
  });
  const res = result?.result;
  // Treat the re-entry guard as success — the listener is already registered
  // from a concurrent injection, so the retried sendMessage will succeed.
  if (!res || (!res.ok && !res.error?.includes("already loaded"))) {
    throw new Error(
      `Failed to inject SingleFile content script: ${res?.error ?? "unknown error"}`,
    );
  }
}

/**
 * Upload the captured HTML as an asset and return the asset id.
 */
export async function uploadSingleFileAsset(
  html: string,
  title?: string,
): Promise<string> {
  const settings = await getPluginSettings();

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

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload asset: ${response.status} ${errorText}`);
  }

  const { assetId } = (await response.json()) as { assetId: string };
  return assetId;
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9-_\s]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}
