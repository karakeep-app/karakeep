"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export default function SignInProviderButton({
  provider,
}: {
  provider: {
    id: string;
    name: string;
  };
}) {
  return (
    <Button
      onClick={async () => {
        const { data, error } = await authClient.signIn.oauth2({
          providerId: provider.id,
          callbackURL: "/",
        });
        if (error) {
          console.error("OAuth sign-in failed", error);
          return;
        }
        if (data?.url) {
          window.location.href = data.url;
        }
      }}
      className="w-full"
    >
      Sign in with {provider.name}
    </Button>
  );
}
