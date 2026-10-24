import type { Settings } from "./settings";

export function getServerOrigin(address: string): string | undefined {
  try {
    const url = new URL(address);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function getBrowserSessionCredentials(
  settings: Pick<Settings, "address" | "browserSessionOrigin">,
): RequestCredentials | undefined {
  const origin = getServerOrigin(settings.address);
  // An opt-in for one server must not enable cookies for another server.
  return origin && settings.browserSessionOrigin === origin
    ? "include"
    : undefined;
}

export function requestBrowserSessionPermission(
  address: string,
): Promise<boolean> {
  const origin = getServerOrigin(address);
  if (!origin) return Promise.resolve(false);
  // Firefox host match patterns do not accept a port. Keep the cookie opt-in
  // itself bound to the full origin, including its port.
  const url = new URL(origin);
  // Call directly from the switch's user gesture, before any other await.
  return chrome.permissions.request({
    origins: [`${url.protocol}//${url.hostname}/*`],
  });
}
