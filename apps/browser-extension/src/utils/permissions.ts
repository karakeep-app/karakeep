export function requestPagePermission(url: string): Promise<boolean> {
  const page = new URL(url);
  if (page.protocol !== "http:" && page.protocol !== "https:") {
    return Promise.resolve(false);
  }
  return chrome.permissions.request({ origins: [`${page.origin}/*`] });
}
