"use client";

import type { auth } from "@/server/auth";
import {
  customSessionClient,
  genericOAuthClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  disableDefaultFetchPlugins: true,
  plugins: [customSessionClient<typeof auth>(), genericOAuthClient()],
});
