"use client";

/**
 * Centralized client-side auth utilities.
 * This module re-exports next-auth/react functions to allow for easier
 * future migration to a different auth provider.
 */

export { SessionProvider, signIn, signOut, useSession } from "next-auth/react";

export type { Session } from "next-auth";
