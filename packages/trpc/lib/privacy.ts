/**
 * Privacy-by-Construction Type System
 *
 * This module provides type-safe primitives for enforcing privacy checks at compile time.
 * The core principle: it should be IMPOSSIBLE to access user data without proving access rights.
 *
 * ## Core Concepts
 *
 * 1. **Unverified<T>**: Raw data from the database that hasn't been access-checked.
 *    Cannot be used directly - must go through verification.
 *
 * 2. **Verified<T, Level>**: Data that has passed access verification.
 *    The access level is encoded in the type, enabling compile-time enforcement.
 *
 * 3. **Access Levels**: Hierarchical permission levels
 *    - "owner": Full control (delete, manage collaborators, etc.)
 *    - "editor": Can modify content
 *    - "viewer": Read-only access
 *
 * ## Usage Example
 *
 * ```typescript
 * // Define your resource type
 * interface BookmarkData {
 *   id: string;
 *   userId: string;
 *   title: string;
 * }
 *
 * // Create a verified resource class
 * class Bookmark extends VerifiedResource<BookmarkData> {
 *   // This method only accepts owner-level access
 *   delete(this: Bookmark & HasAccess<"owner">): Promise<void> {
 *     return db.delete(this.data.id);
 *   }
 *
 *   // This method accepts any access level
 *   getTitle(): string {
 *     return this.data.title;
 *   }
 * }
 *
 * // Usage in router
 * const bookmark = await Bookmark.verifyAccess(ctx, bookmarkId);
 * // TypeScript knows the access level!
 * if (bookmark.hasOwnerAccess()) {
 *   await bookmark.delete(); // ✅ Compiles
 * }
 *
 * // Attempting to delete without owner check:
 * // bookmark.delete(); // ❌ TypeScript error!
 * ```
 */

import { TRPCError } from "@trpc/server";

import type { AuthedContext } from "..";

// =============================================================================
// Access Level Types
// =============================================================================

/**
 * Hierarchical access levels for resources.
 * Each level implies all lower levels (owner can do everything editor can, etc.)
 */
export type AccessLevel = "owner" | "editor" | "viewer";

/**
 * Type that represents having at least the specified access level.
 * Used for method constraints.
 */
export type HasAccess<L extends AccessLevel> = {
  readonly __accessLevel: L | HigherAccessLevel<L>;
};

/**
 * Maps an access level to all levels that are "higher" (more permissive).
 */
type HigherAccessLevel<L extends AccessLevel> = L extends "viewer"
  ? "editor" | "owner"
  : L extends "editor"
    ? "owner"
    : never;

/**
 * Type guard result that narrows the access level.
 */
export type AccessLevelCheck<T, L extends AccessLevel> = T & HasAccess<L>;

// =============================================================================
// Verification Result Types
// =============================================================================

/**
 * Result of a verification attempt.
 * Either access is granted with a specific level, or it's denied.
 */
export type VerificationResult<T> =
  | { verified: true; data: T; level: AccessLevel }
  | { verified: false; reason: string };

/**
 * A successfully verified resource with its access level.
 */
export interface VerifiedData<T, L extends AccessLevel = AccessLevel> {
  readonly data: T;
  readonly accessLevel: L;
  readonly __brand: "verified";
}

// =============================================================================
// Unverified Wrapper
// =============================================================================

/**
 * Wrapper for unverified data from the database.
 * This type is intentionally unusable - you MUST verify before accessing.
 *
 * The data is private and there's no way to extract it without verification.
 */
export class Unverified<T> {
  private readonly _data: T;
  private readonly __brand = "unverified" as const;

  constructor(data: T) {
    this._data = data;
  }

  /**
   * Verify access to this data.
   * Returns a VerifiedData wrapper if access is granted.
   */
  async verify<L extends AccessLevel>(
    checker: () => Promise<L | null>,
  ): Promise<VerifiedData<T, L>> {
    const level = await checker();
    if (level === null) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Access denied",
      });
    }
    return {
      data: this._data,
      accessLevel: level,
      __brand: "verified",
    };
  }

  /**
   * Verify access or return null if denied (non-throwing variant).
   */
  async verifyOrNull<L extends AccessLevel>(
    checker: () => Promise<L | null>,
  ): Promise<VerifiedData<T, L> | null> {
    const level = await checker();
    if (level === null) {
      return null;
    }
    return {
      data: this._data,
      accessLevel: level,
      __brand: "verified",
    };
  }
}

// =============================================================================
// Base Verified Resource Class
// =============================================================================

/**
 * Base class for resources that require access verification.
 *
 * Subclasses should:
 * 1. Define static factory methods that verify access
 * 2. Use `HasAccess<L>` constraints on methods requiring specific access levels
 * 3. Never expose a public constructor or fromData method
 *
 * @example
 * ```typescript
 * class Bookmark extends VerifiedResource<BookmarkData, AuthedContext> {
 *   // Only accessible to owners
 *   async delete(this: Bookmark & HasAccess<"owner">): Promise<void> {
 *     // ...
 *   }
 *
 *   // Factory method that verifies access
 *   static async fromId(ctx: AuthedContext, id: string): Promise<Bookmark> {
 *     const data = await ctx.db.query.bookmarks.findFirst({ where: eq(id) });
 *     if (!data) throw new NotFoundError();
 *
 *     const accessLevel = await determineAccess(ctx, data);
 *     return new Bookmark(ctx, data, accessLevel);
 *   }
 * }
 * ```
 */
export abstract class VerifiedResource<TData, TContext = AuthedContext> {
  /**
   * The raw data. Subclasses access this via `this.data`.
   */
  protected readonly data: TData;

  /**
   * The authenticated context.
   */
  protected readonly ctx: TContext;

  /**
   * The verified access level. This is also encoded in the type.
   */
  readonly __accessLevel: AccessLevel;

  /**
   * Protected constructor - only subclasses can instantiate.
   * The access level is verified before construction.
   */
  protected constructor(ctx: TContext, data: TData, accessLevel: AccessLevel) {
    this.ctx = ctx;
    this.data = data;
    this.__accessLevel = accessLevel;
  }

  // ===========================================================================
  // Access Level Checks (Type Guards)
  // ===========================================================================

  /**
   * Check if the user has owner-level access.
   * This is a type guard that narrows the type.
   */
  isOwner(): this is this & HasAccess<"owner"> {
    return this.__accessLevel === "owner";
  }

  /**
   * Check if the user has at least editor-level access.
   */
  isAtLeastEditor(): this is this & HasAccess<"editor"> {
    return this.__accessLevel === "owner" || this.__accessLevel === "editor";
  }

  /**
   * Check if the user has at least viewer-level access.
   * (Always true for verified resources, but useful for type narrowing)
   */
  isAtLeastViewer(): this is this & HasAccess<"viewer"> {
    return true;
  }

  // ===========================================================================
  // Enforcement Methods (Throwing)
  // ===========================================================================

  /**
   * Ensure owner access, throwing if not authorized.
   * Returns `this` with narrowed type for method chaining.
   */
  requireOwner(): this & HasAccess<"owner"> {
    if (!this.isOwner()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This action requires owner access",
      });
    }
    return this;
  }

  /**
   * Ensure at least editor access, throwing if not authorized.
   */
  requireEditor(): this & HasAccess<"editor"> {
    if (!this.isAtLeastEditor()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This action requires editor access",
      });
    }
    return this as this & HasAccess<"editor">;
  }

  /**
   * Ensure at least viewer access, throwing if not authorized.
   */
  requireViewer(): this & HasAccess<"viewer"> {
    if (!this.isAtLeastViewer()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This action requires viewer access",
      });
    }
    return this as this & HasAccess<"viewer">;
  }
}

// =============================================================================
// Ownership Verification Helpers
// =============================================================================

/**
 * Simple ownership check for resources with a userId field.
 * Returns "owner" if the user owns the resource, null otherwise.
 */
export function checkOwnership<T extends { userId: string }>(
  ctx: AuthedContext,
  data: T,
): AccessLevel | null {
  return data.userId === ctx.user.id ? "owner" : null;
}

/**
 * Create a verification function for simple ownership-based resources.
 */
export function ownershipVerifier<T extends { userId: string }>(
  ctx: AuthedContext,
): (data: T) => Promise<AccessLevel | null> {
  return async (data: T) => {
    return data.userId === ctx.user.id ? "owner" : null;
  };
}

// =============================================================================
// Decorators for Method Access Control (Alternative API)
// =============================================================================

/**
 * Marker type for methods that require owner access.
 * Used with the `this` parameter in method signatures.
 *
 * @example
 * ```typescript
 * class Resource extends VerifiedResource<Data> {
 *   delete(this: RequireOwner<typeof this>): Promise<void> {
 *     // Only callable when this.isOwner() would return true
 *   }
 * }
 * ```
 */
export type RequireOwner<T> = T & HasAccess<"owner">;

/**
 * Marker type for methods that require at least editor access.
 */
export type RequireEditor<T> = T & HasAccess<"editor">;

/**
 * Marker type for methods that require at least viewer access.
 */
export type RequireViewer<T> = T & HasAccess<"viewer">;

// =============================================================================
// Privacy-Safe Query Builder
// =============================================================================

/**
 * Options for building privacy-aware queries.
 */
export interface PrivacyQueryOptions<T> {
  /**
   * The user ID to check ownership against.
   */
  userId: string;

  /**
   * Additional access check beyond ownership.
   * Return the access level if access should be granted, null otherwise.
   */
  additionalCheck?: (data: T) => Promise<AccessLevel | null>;
}

/**
 * Result of a privacy-aware query.
 */
export interface PrivacyQueryResult<T> {
  data: T;
  accessLevel: AccessLevel;
}

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * Extract the data type from a VerifiedResource.
 */
export type DataOf<T> = T extends VerifiedResource<infer D, unknown> ? D : never;

/**
 * Extract the access level from a VerifiedResource at runtime.
 */
export type AccessLevelOf<T> =
  T extends VerifiedResource<unknown, unknown>
    ? T["__accessLevel"]
    : T extends VerifiedData<unknown, infer L>
      ? L
      : never;

/**
 * Type predicate for checking if something is a VerifiedResource.
 */
export function isVerifiedResource<T, C>(
  value: unknown,
): value is VerifiedResource<T, C> {
  return (
    value !== null &&
    typeof value === "object" &&
    "__accessLevel" in value &&
    typeof (value as Record<string, unknown>).__accessLevel === "string"
  );
}
