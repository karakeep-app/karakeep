import { cache } from "react";
import { createContext } from "@/server/api/client";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";

import { appRouter } from "@karakeep/trpc/routers/_app";

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
        },
      },
    }),
);

export const serverTrpc = createTRPCOptionsProxy({
  ctx: () => createContext(),
  router: appRouter,
  queryClient: getQueryClient,
});
