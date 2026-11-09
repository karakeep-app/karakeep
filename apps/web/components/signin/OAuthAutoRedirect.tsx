"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth/client";
import { useClientConfig } from "@/lib/clientConfig";

export default function OAuthAutoRedirect({
  oauthProviderId,
  redirectUrl,
}: {
  oauthProviderId: string;
  redirectUrl: string;
}) {
  const clientConfig = useClientConfig();
  const searchParams = useSearchParams();
  const hasError = searchParams.has("error");

  const shouldRedirect =
    clientConfig.auth.oauthAutoRedirect &&
    clientConfig.auth.disablePasswordAuth &&
    !!oauthProviderId &&
    !hasError;

  const [isRedirecting, setIsRedirecting] = useState(shouldRedirect);

  useEffect(() => {
    if (shouldRedirect) {
      signIn(oauthProviderId, {
        callbackUrl: redirectUrl,
      });
    } else {
      setIsRedirecting(false);
    }
  }, [shouldRedirect, oauthProviderId, redirectUrl]);

  if (isRedirecting) {
    return (
      <div className="flex justify-center p-8">
        <span className="text-muted-foreground">
          Redirecting to login provider...
        </span>
      </div>
    );
  }
  return null;
}
