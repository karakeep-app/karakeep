/**
 * Host-permission helpers for the client-side crawling feature.
 *
 * `<all_urls>` is declared as an *optional* host permission so it isn't granted
 * at install time. It's only needed when the user opts in to client-side
 * crawling (capturing pages in the browser via SingleFile), at which point we
 * ask for it via `chrome.permissions.request()` — which must be called from a
 * user gesture (e.g. flipping the settings switch).
 */

const HOST_PERMISSIONS: chrome.permissions.Permissions = {
  origins: ["<all_urls>"],
};

export function hasHostPermission(): Promise<boolean> {
  return chrome.permissions.contains(HOST_PERMISSIONS);
}

export function requestHostPermission(): Promise<boolean> {
  return chrome.permissions.request(HOST_PERMISSIONS);
}

export function removeHostPermission(): Promise<boolean> {
  return chrome.permissions.remove(HOST_PERMISSIONS);
}
