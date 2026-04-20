import { TRPCError } from "@trpc/server";

import type { AuthedContext } from "../index";

// --- Actor ---

export type Actor =
  | { type: "user"; userId: string; role: "admin" | "user" | null }
  | { type: "system"; userId: string };

export function actorUserId(actor: Actor): string {
  return actor.userId;
}

export function actorFromContext(ctx: AuthedContext): Actor {
  return {
    type: "user",
    userId: ctx.user.id,
    role: ctx.user.role,
  };
}

// --- Authorization checks ---

export function assertOwnership(
  actor: Actor,
  resourceUserId: string,
  opts?: { notFoundOnDeny?: boolean; notFoundMessage?: string },
): void {
  if (actorUserId(actor) === resourceUserId) {
    return;
  }

  if (opts?.notFoundOnDeny) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: opts.notFoundMessage ?? "Resource not found",
    });
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "User is not allowed to access resource",
  });
}

// --- Branded types for compile-time authz enforcement ---

declare const __access: unique symbol;

/**
 * A resource that has been verified for a specific access level.
 * Can only be created via the `authorize()` function after an authz check.
 *
 * For simple ownership: `Authorized<Feed>` (defaults to "owner")
 * For role-based access: `Authorized<List, "editor">`, `Authorized<List, "viewer">`
 */
export type Authorized<T, Access extends string = "owner"> = T & {
  readonly [__access]: Access;
};

/**
 * Brands a resource as authorized for a specific access level.
 * Takes an authorization check as an argument — the check is executed
 * before the resource is branded, making it impossible to skip.
 *
 * @param resource - The resource to authorize
 * @param check - The authorization check to perform (can be sync or async)
 */
export async function authorize<T, Access extends string = "owner">(
  resource: T,
  check: () => void | Promise<void>,
): Promise<Authorized<T, Access>> {
  await check();
  return resource as Authorized<T, Access>;
}
