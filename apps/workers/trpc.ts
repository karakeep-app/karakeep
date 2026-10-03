import type { AuthedContext } from "@karakeep/trpc";
import { createCallerFactory } from "@karakeep/trpc";
import { buildImpersonatingAuthedContext as buildAuthedContext } from "@karakeep/trpc/lib/impersonate";
import { appRouter } from "@karakeep/trpc/routers/_app";

export const buildImpersonatingAuthedContext = buildAuthedContext;

/**
 * This is only safe to use in the context of a worker.
 */
export async function buildImpersonatingTRPCClient(
  userId: string,
  beforeBookmarkWrite?: AuthedContext["beforeBookmarkWrite"],
) {
  const createCaller = createCallerFactory(appRouter);

  return createCaller({
    ...(await buildImpersonatingAuthedContext(userId)),
    beforeBookmarkWrite,
  });
}
