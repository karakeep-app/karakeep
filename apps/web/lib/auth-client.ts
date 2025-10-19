"use client";

import type { auth, AuthSession } from "@/server/auth";
import { createContext, useContext } from "react";
import {
  customSessionClient,
  genericOAuthClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const SessionContext = createContext<AuthSession | null>(null);

export function useSession(): AuthSession | null {
  return useContext(SessionContext);
}

export const authClient = createAuthClient({
  disableDefaultFetchPlugins: true,
  plugins: [customSessionClient<typeof auth>(), genericOAuthClient()],
});
