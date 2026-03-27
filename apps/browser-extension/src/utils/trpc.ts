import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@karakeep/trpc/routers/_app";

import { getPluginSettings } from "./settings";
import { createChromeStorage } from "./storagePersister";

export { useTRPC } from "@karakeep/shared-react/trpc";

/**
 * Error message shown when the server returns non-JSON content.
 * This typically happens when the server address is incorrect (e.g., includes /api/v1 suffix)
 * and the server returns a 404 HTML page instead of a JSON response.
 */
export const SERVER_ADDRESS_ERROR_MESSAGE =
  "Unable to connect to the Karakeep server. Please check that your server address is correct. " +
  "The address should be the base URL (e.g., https://cloud.karakeep.app or http://localhost:3000) " +
  "without any /api/v1 suffix.";

/**
 * Custom fetch wrapper that detects non-JSON responses and provides better error messages.
 */
async function customFetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const response = await fetch(url, options);

  // Check if the response is not JSON by checking content-type header
  const contentType = response.headers.get("content-type");
  if (
    !response.ok &&
    (!contentType || !contentType.includes("application/json"))
  ) {
    // Try to get the response text to see what was returned
    const text = await response.text();
    const preview = text.substring(0, 100);

    // Check if it looks like HTML (starts with <)
    const isHtml =
      preview.trim().toLowerCase().startsWith("<!doctype") ||
      preview.trim().toLowerCase().startsWith("<html") ||
      preview.trim().startsWith("<");

    if (isHtml) {
      throw new Error(
        `Server returned an HTML error page instead of JSON. ${SERVER_ADDRESS_ERROR_MESSAGE}`,
      );
    } else {
      throw new Error(
        `Server returned an unexpected response: "${preview}...". ${SERVER_ADDRESS_ERROR_MESSAGE}`,
      );
    }
  }

  return response;
}

/**
 * Check if an error is a JSON parse error, which typically indicates
 * the server returned non-JSON content (like an HTML error page).
 */
export function isJsonParseError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("unexpected") &&
      (message.includes("json") || message.includes("position"))
    );
  }
  return false;
}

/**
 * Get a user-friendly error message from a tRPC error.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof TRPCClientError) {
    // Check for JSON parse errors
    if (isJsonParseError(error.cause)) {
      return SERVER_ADDRESS_ERROR_MESSAGE;
    }
    return error.message || "An unexpected error occurred";
  }

  if (error instanceof Error) {
    if (isJsonParseError(error)) {
      return SERVER_ADDRESS_ERROR_MESSAGE;
    }
    return error.message;
  }

  return "An unexpected error occurred";
}

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
          fetch: customFetch,
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
