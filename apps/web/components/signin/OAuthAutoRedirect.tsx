"use client";

import { useEffect } from "react";
import { signIn } from "@/lib/auth/client";
import { useClientConfig } from "@/lib/clientConfig";

export default function OAuthAutoRedirect({
  oauthProviderId,
}: {
  oauthProviderId: string;
}) {
  const clientConfig = useClientConfig();

  useEffect(() => {
    // Auto-redirect if:
    // 1. OAuth auto redirect is enabled
    // 2. Password auth is disabled
    // 3. An OAuth provider is configured
    if (
      clientConfig.auth.oauthAutoRedirect &&
      clientConfig.auth.disablePasswordAuth &&
      oauthProviderId
    ) {
      signIn(oauthProviderId, {
        callbackUrl: "/",
      });
    }
  }, [clientConfig, oauthProviderId]);

  return null;
}
