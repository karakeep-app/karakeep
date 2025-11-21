import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/server/auth";
import { api } from "@/server/api/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";
import Link from "next/link";

export default async function MobileAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ keyName?: string }>;
}) {
  const session = await getServerAuthSession();
  const params = await searchParams;
  const keyName = params.keyName || "Mobile App";

  if (session) {
    try {
      // User is authenticated, generate API key and redirect to mobile app
      const apiKey = await api.apiKeys.exchangeWebSession({
        keyName,
      });

      const callbackUrl = new URL("karakeep://auth-callback");
      callbackUrl.searchParams.set("apiKey", apiKey.key);
      callbackUrl.searchParams.set("apiKeyId", apiKey.id);

      redirect(callbackUrl.toString());
    } catch (error) {
      console.error("Error generating mobile API key:", error);
      redirect("/signin?error=auth_failed");
    }
  }

  // User is not authenticated, show sign-in prompt
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Smartphone className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Mobile App Authorization</CardTitle>
          <CardDescription>
            Sign in to authorize the Karakeep mobile app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            After signing in, you'll be redirected back to the mobile app with
            your credentials.
          </p>
          <Button asChild className="w-full" size="lg">
            <Link href={`/signin?callbackUrl=${encodeURIComponent("/mobile-auth")}`}>
              Continue to Sign In
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
