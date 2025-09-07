import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@karakeep/trpc/routers/_app";

import { getPluginSettings } from "./settings";
import { createChromeStorage } from "./storagePersister";

export const api = createTRPCReact<AppRouter>();

let apiClient: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;
let queryClient: QueryClient | null = null;
let currentSettings: {
  address: string;
  apiKey: string;
  badgeCacheExpireMs: number;
  useBadgeCache: boolean;
} | null = null;

export async function initializeClients() {
  const { address, apiKey, badgeCacheExpireMs, useBadgeCache } =
    await getPluginSettings();

  if (currentSettings) {
    const addressChanged = currentSettings.address !== address;
    const apiKeyChanged = currentSettings.apiKey !== apiKey;
    const cacheTimeChanged =
      currentSettings.badgeCacheExpireMs !== badgeCacheExpireMs;
    const useBadgeCacheChanged =
      currentSettings.useBadgeCache !== useBadgeCache;

    if (!address && !apiKey) {
      // Invalid configuration, clean
      cleanupApiClient();
      return;
    }

    if (addressChanged || apiKeyChanged) {
      // Switch context completely → discard the old instance
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
      !useBadgeCacheChanged
    ) {
      return;
    }
  }

  if (address && apiKey) {
    // Store current settings
    currentSettings = { address, apiKey, badgeCacheExpireMs, useBadgeCache };

    // Create new QueryClient with updated settings
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          // If useBadgeCache is false, set cache times to 0 to disable caching
          gcTime: useBadgeCache ? badgeCacheExpireMs * 2 : 0, // Keep in memory for twice as long as stale time
          staleTime: useBadgeCache ? badgeCacheExpireMs : 0, // Use the user-configured cache expire time
        },
      },
    });

    const persister = createChromeStorage(
      globalThis.chrome?.storage?.local as chrome.storage.StorageArea,
    );
    if (useBadgeCache) {
      await persistQueryClient({
        queryClient,
        persister,
        // Avoid restoring very old data and bust on policy changes
        maxAge: badgeCacheExpireMs * 2,
        buster: `badge:${badgeCacheExpireMs}`,
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
