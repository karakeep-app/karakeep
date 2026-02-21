"use client";

import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth/client";

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
      onClick={() =>
        signIn(provider.id, {
          callbackUrl: "/",
        })
      }
      className="w-full"
    >
      Sign in with {provider.name}
    </Button>
  );
}
