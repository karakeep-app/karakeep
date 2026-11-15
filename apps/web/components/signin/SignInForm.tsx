import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { oauthProviders } from "@/server/auth";
import { Info } from "lucide-react";

import serverConfig from "@karakeep/shared/config";

import CredentialsForm from "./CredentialsForm";
import OAuthAutoRedirect from "./OAuthAutoRedirect";
import SignInProviderButton from "./SignInProviderButton";

export default async function SignInForm({
  redirectUrl,
}: {
  redirectUrl: string;
}) {
  const providerValues = oauthProviders;

  return (
    <div className="w-full">
      {/* Auto-redirect to OAuth provider if configured */}
      {providerValues && providerValues.length > 0 && (
        <OAuthAutoRedirect
          oauthProviderId={providerValues[0].id}
          redirectUrl={redirectUrl}
        />
      )}
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold">Welcome back</CardTitle>
          <CardDescription>Sign in to your Karakeep account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {serverConfig.demoMode && (
            <Alert>
              <Info className="size-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-semibold">Demo mode</p>
                  <p>Email: {serverConfig.demoMode.email}</p>
                  <p>Password: {serverConfig.demoMode.password}</p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <CredentialsForm redirectUrl={redirectUrl} />

          {providerValues && providerValues.length > 0 && (
            <>
              <div className="flex w-full items-center">
                <div className="flex-1 grow border-t"></div>
                <span className="px-3 text-sm text-muted-foreground">Or</span>
                <div className="flex-1 grow border-t"></div>
              </div>
              <div className="space-y-2">
                {providerValues.map((provider) => (
                  <SignInProviderButton
                    key={provider.id}
                    provider={{ id: provider.id, name: provider.name }}
                    redirectUrl={redirectUrl}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
