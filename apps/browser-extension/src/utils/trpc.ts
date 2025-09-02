import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@karakeep/trpc/routers/_app";

import { getPluginSettings } from "./settings";

export const api = createTRPCReact<AppRouter>();

let apiClient: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;

export async function getApiClient() {
  if (!apiClient) {
    const pluginSettings = await getPluginSettings();
    apiClient = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${pluginSettings.address}/api/trpc`,
          headers() {
            return {
              Authorization: `Bearer ${pluginSettings.apiKey}`,
            };
          },
          transformer: superjson,
        }),
      ],
    });
  }
  return apiClient;
}

export function cleanupApiClient() {
  apiClient = null;
}
