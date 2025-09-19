import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authOptions } from "@/server/auth";
import { Info } from "lucide-react";

import serverConfig from "@karakeep/shared/config";

import CredentialsForm from "./CredentialsForm";
import SignInProviderButton from "./SignInProviderButton";

export default async function SignInForm() {
  const providers = authOptions.providers;
  let providerValues;
  if (providers) {
    providerValues = Object.values(providers).filter(
      // Credentials are handled manually by the sign in form
      (p) => p.id != "credentials",
    );
  }

  return (
    <div className="w-full">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
          <CardDescription>Sign in to your Karakeep account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {serverConfig.demoMode && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-semibold">Demo Mode</p>
                  <p>Email: {serverConfig.demoMode.email}</p>
                  <p>Password: {serverConfig.demoMode.password}</p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <CredentialsForm />

          {providerValues && providerValues.length > 0 && (
            <>
              <div className="flex w-full items-center">
                <div className="flex-1 grow border-t border-gray-200"></div>
                <span className="bg-white px-3 text-sm text-gray-500">Or</span>
                <div className="flex-1 grow border-t border-gray-200"></div>
              </div>
              <div className="space-y-2">
                {providerValues.map((provider) => (
                  <SignInProviderButton
                    key={provider.id}
                    provider={{ id: provider.id, name: provider.name }}
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
