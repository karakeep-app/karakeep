import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@karakeep/trpc/routers/_app";

import { getPluginSettings } from "./settings";
import { createChromeStorage } from "./storagePersister";

export { useTRPC } from "@karakeep/shared-react/trpc";

let apiClient: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;
let queryClient: QueryClient | null = null;
let currentSettings: {
  address: string;
  apiKey: string;
  badgeCacheExpireMs: number;
  useBadgeCache: boolean;
  customHeaders: Record<string, string>;
} | null = null;

export async function initializeClients() {
  const { address, apiKey, badgeCacheExpireMs, useBadgeCache, customHeaders } =
    await getPluginSettings();

  if (currentSettings) {
    const addressChanged = currentSettings.address !== address;
    const apiKeyChanged = currentSettings.apiKey !== apiKey;
    const cacheTimeChanged =
      currentSettings.badgeCacheExpireMs !== badgeCacheExpireMs;
    const useBadgeCacheChanged =
      currentSettings.useBadgeCache !== useBadgeCache;
    const customHeadersChanged =
      JSON.stringify(currentSettings.customHeaders) !==
      JSON.stringify(customHeaders);

    if (!address || !apiKey) {
      // Invalid configuration, clean
      const persisterForCleanup = createChromeStorage();
      await persisterForCleanup.removeClient();
      cleanupApiClient();
      return;
    }

    if (addressChanged || apiKeyChanged || customHeadersChanged) {
      // Switch context completely → discard the old instance and wipe persisted cache
      const persisterForCleanup = createChromeStorage();
      await persisterForCleanup.removeClient();
      cleanupApiClient();
    } else if ((cacheTimeChanged || useBadgeCacheChanged) && queryClient) {
      // Change the cache policy only → Clean up the data, but reuse the instance
      queryClient.clear();
    }

    // If there is already existing and there is no major change in settings, reuse it
    if (
      queryClient &&
      apiClient &&
      currentSettings &&
      !addressChanged &&
      !apiKeyChanged &&
      !cacheTimeChanged &&
      !useBadgeCacheChanged &&
      !customHeadersChanged
    ) {
      return;
    }
  }

  if (address && apiKey) {
    // Store current settings
    currentSettings = {
      address,
      apiKey,
      badgeCacheExpireMs,
      useBadgeCache,
      customHeaders,
    };

    // Create new QueryClient with updated settings
    queryClient = new QueryClient();

    const persister = createChromeStorage();
    if (useBadgeCache) {
      persistQueryClient({
        queryClient,
        persister,
        // Avoid restoring very old data and bust on policy changes
        maxAge: badgeCacheExpireMs * 2,
        buster: `badge:${address}:${badgeCacheExpireMs}`,
      });
    } else {
      // Ensure disk cache is cleared when caching is disabled
      await persister.removeClient();
    }

    apiClient = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${address}/api/trpc`,
          headers() {
            return {
              Authorization: `Bearer ${apiKey}`,
              ...customHeaders,
            };
          },
          transformer: superjson,
        }),
      ],
    });
  }
}

export async function getApiClient() {
  if (!apiClient) {
    await initializeClients();
  }
  return apiClient;
}

export async function getQueryClient() {
  // Check if settings have changed and reinitialize if needed
  await initializeClients();
  return queryClient;
}

export function cleanupApiClient() {
  apiClient = null;
  queryClient = null;
  currentSettings = null;
}
