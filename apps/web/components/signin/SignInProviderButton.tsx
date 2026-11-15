"use client";

import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth/client";

export default function SignInProviderButton({
  provider,
  redirectUrl,
}: {
  provider: {
    id: string;
    name: string;
  };
  redirectUrl: string;
}) {
  return (
    <Button
      onClick={() =>
        signIn(provider.id, {
          callbackUrl: redirectUrl,
        })
      }
      className="w-full"
    >
      Sign in with {provider.name}
    </Button>
  );
}
