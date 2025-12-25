/**
 * Privacy-Safe Middleware for tRPC Routers
 *
 * This module provides type-safe middleware that integrates the privacy
 * type system with tRPC's middleware chain.
 *
 * KEY BENEFITS:
 * 1. Verified resources are passed through context
 * 2. TypeScript enforces correct access levels in handlers
 * 3. Middleware can be composed for different access requirements
 */

import { experimental_trpcMiddleware } from "@trpc/server";

import type { AuthedContext } from "..";
import type { AccessLevel, HasAccess } from "./privacy";

// =============================================================================
// Generic Resource Middleware
// =============================================================================

/**
 * Creates middleware that loads and verifies a resource by ID.
 *
 * The middleware adds the verified resource to the context, and the context
 * type includes the access level for compile-time enforcement.
 *
 * @example
 * ```typescript
 * // Define middleware for loading bookmarks
 * const withBookmark = createResourceMiddleware({
 *   paramName: "bookmarkId",
 *   loader: (ctx, id) => Bookmark.fromId(ctx, id),
 *   contextKey: "bookmark",
 * });
 *
 * // Use in router
 * const bookmarksRouter = router({
 *   delete: authedProcedure
 *     .input(z.object({ bookmarkId: z.string() }))
 *     .use(withBookmark)
 *     .mutation(async ({ ctx }) => {
 *       // ctx.bookmark is typed as verified with appropriate access level
 *       await ctx.bookmark.requireOwner().delete();
 *     }),
 * });
 * ```
 */
export function createResourceMiddleware<
  TInput extends Record<string, unknown>,
  TParamName extends keyof TInput & string,
  TResource extends { __accessLevel: AccessLevel },
  TContextKey extends string,
>(config: {
  /** The input parameter name containing the resource ID */
  paramName: TParamName;
  /** Function to load and verify the resource */
  loader: (
    ctx: AuthedContext,
    id: TInput[TParamName],
  ) => Promise<TResource>;
  /** Key to add the resource under in the context */
  contextKey: TContextKey;
}) {
  return experimental_trpcMiddleware<{
    ctx: AuthedContext;
    input: TInput;
  }>().create(async (opts) => {
    const resourceId = opts.input[config.paramName];
    const resource = await config.loader(opts.ctx, resourceId);

    return opts.next({
      ctx: {
        ...opts.ctx,
        [config.contextKey]: resource,
      } as AuthedContext & Record<TContextKey, TResource>,
    });
  });
}

// =============================================================================
// Access Level Enforcement Middleware
// =============================================================================

/**
 * Creates middleware that enforces a minimum access level on a context resource.
 *
 * Use this after loading a resource to ensure the handler only executes
 * if the user has sufficient access.
 *
 * @example
 * ```typescript
 * const requireListOwner = createAccessLevelMiddleware({
 *   contextKey: "list",
 *   requiredLevel: "owner",
 * });
 *
 * const listsRouter = router({
 *   delete: authedProcedure
 *     .input(z.object({ listId: z.string() }))
 *     .use(withList)           // Load and verify list
 *     .use(requireListOwner)   // Ensure owner access
 *     .mutation(async ({ ctx }) => {
 *       // TypeScript knows ctx.list has owner access
 *       await ctx.list.delete();
 *     }),
 * });
 * ```
 */
export function createAccessLevelMiddleware<
  TContextKey extends string,
  TResource extends { __accessLevel: AccessLevel; requireOwner: () => unknown; requireEditor: () => unknown },
  TRequiredLevel extends AccessLevel,
>(config: {
  contextKey: TContextKey;
  requiredLevel: TRequiredLevel;
}) {
  return experimental_trpcMiddleware<{
    ctx: AuthedContext & Record<TContextKey, TResource>;
  }>().create(async (opts) => {
    const resource = (opts.ctx as Record<TContextKey, TResource>)[config.contextKey];

    // Call the appropriate require method (throws if insufficient access)
    if (config.requiredLevel === "owner") {
      resource.requireOwner();
    } else if (config.requiredLevel === "editor") {
      resource.requireEditor();
    }
    // "viewer" is always satisfied for verified resources

    return opts.next({
      ctx: {
        ...opts.ctx,
        // Narrow the type to include the required access level
        [config.contextKey]: resource as TResource & HasAccess<TRequiredLevel>,
      } as unknown as AuthedContext &
        Record<TContextKey, TResource & HasAccess<TRequiredLevel>>,
    });
  });
}

// =============================================================================
// Prebuilt Middleware Factories
// =============================================================================

/**
 * Factory for creating standard resource middleware with common patterns.
 */
export function defineResourceMiddleware<TResource extends { __accessLevel: AccessLevel }>(
  loader: (ctx: AuthedContext, id: string) => Promise<TResource>,
) {
  return {
    /**
     * Create middleware that loads and verifies the resource.
     */
    load<TContextKey extends string>(contextKey: TContextKey) {
      return experimental_trpcMiddleware<{
        ctx: AuthedContext;
        input: { [K in TContextKey as `${K}Id`]: string };
      }>().create(async (opts) => {
        const paramKey = `${contextKey}Id` as keyof typeof opts.input;
        const id = opts.input[paramKey] as string;
        const resource = await loader(opts.ctx, id);

        return opts.next({
          ctx: {
            ...opts.ctx,
            [contextKey]: resource,
          } as AuthedContext & Record<TContextKey, TResource>,
        });
      });
    },

    /**
     * Create middleware that loads the resource AND enforces owner access.
     */
    loadAsOwner<TContextKey extends string>(contextKey: TContextKey) {
      return experimental_trpcMiddleware<{
        ctx: AuthedContext;
        input: { [K in TContextKey as `${K}Id`]: string };
      }>().create(async (opts) => {
        const paramKey = `${contextKey}Id` as keyof typeof opts.input;
        const id = opts.input[paramKey] as string;
        const resource = await loader(opts.ctx, id);

        // Enforce owner access
        if (
          "requireOwner" in resource &&
          typeof resource.requireOwner === "function"
        ) {
          (resource as { requireOwner: () => void }).requireOwner();
        }

        return opts.next({
          ctx: {
            ...opts.ctx,
            [contextKey]: resource,
          } as AuthedContext &
            Record<TContextKey, TResource & HasAccess<"owner">>,
        });
      });
    },

    /**
     * Create middleware that loads the resource AND enforces editor access.
     */
    loadAsEditor<TContextKey extends string>(contextKey: TContextKey) {
      return experimental_trpcMiddleware<{
        ctx: AuthedContext;
        input: { [K in TContextKey as `${K}Id`]: string };
      }>().create(async (opts) => {
        const paramKey = `${contextKey}Id` as keyof typeof opts.input;
        const id = opts.input[paramKey] as string;
        const resource = await loader(opts.ctx, id);

        // Enforce editor access
        if (
          "requireEditor" in resource &&
          typeof resource.requireEditor === "function"
        ) {
          (resource as { requireEditor: () => void }).requireEditor();
        }

        return opts.next({
          ctx: {
            ...opts.ctx,
            [contextKey]: resource,
          } as AuthedContext &
            Record<TContextKey, TResource & HasAccess<"editor">>,
        });
      });
    },
  };
}

// =============================================================================
// Type Helpers for Routers
// =============================================================================

/**
 * Helper type for extracting the context type after middleware is applied.
 */
export type ContextWithResource<
  TContextKey extends string,
  TResource,
  TLevel extends AccessLevel = AccessLevel,
> = AuthedContext & Record<TContextKey, TResource & HasAccess<TLevel>>;

/**
 * Type for a procedure context that includes a verified resource.
 */
export type VerifiedContext<
  TResource extends { __accessLevel: AccessLevel },
  TContextKey extends string = "resource",
> = AuthedContext & Record<TContextKey, TResource>;

// =============================================================================
// Usage Documentation
// =============================================================================

/**
 * COMPLETE EXAMPLE: Privacy-Safe Router
 *
 * ```typescript
 * import { VerifiedList } from "../models/lists.privacy-example";
 * import { defineResourceMiddleware } from "../lib/privacy-middleware";
 *
 * // Create middleware factory for lists
 * const listMiddleware = defineResourceMiddleware(
 *   (ctx, id) => VerifiedList.fromId(ctx, id)
 * );
 *
 * // Define router with type-safe privacy enforcement
 * const listsRouter = router({
 *   // Simple read - any access level
 *   get: authedProcedure
 *     .input(z.object({ listId: z.string() }))
 *     .use(listMiddleware.load("list"))
 *     .query(async ({ ctx }) => {
 *       return ctx.list.asPublicList();
 *     }),
 *
 *   // Owner-only operation
 *   delete: authedProcedure
 *     .input(z.object({ listId: z.string() }))
 *     .use(listMiddleware.loadAsOwner("list"))
 *     .mutation(async ({ ctx }) => {
 *       // TypeScript KNOWS ctx.list has owner access
 *       await ctx.list.delete(); // ✅ Compiles!
 *     }),
 *
 *   // Editor operation
 *   addBookmark: authedProcedure
 *     .input(z.object({ listId: z.string(), bookmarkId: z.string() }))
 *     .use(listMiddleware.loadAsEditor("list"))
 *     .mutation(async ({ ctx, input }) => {
 *       // TypeScript KNOWS ctx.list has editor access
 *       await ctx.list.addBookmark(input.bookmarkId); // ✅ Compiles!
 *     }),
 * });
 * ```
 *
 * BENEFITS:
 * 1. Access checks happen in middleware, not in handlers
 * 2. TypeScript enforces that handlers only call methods they have access to
 * 3. Impossible to forget access checks - the types won't match
 * 4. Self-documenting: middleware chain shows required access levels
 */
