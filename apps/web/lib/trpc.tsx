"use client";

// Re-export from shared-react to ensure there's only one TRPCProvider context
// This is necessary because the hooks in shared-react use useTRPC from shared-react
export { TRPCProvider, useTRPC } from "@karakeep/shared-react/trpc";
