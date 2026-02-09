"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { validateRedirectUrl } from "@karakeep/shared/utils/redirectUrl";

export default function CheckEmailPage() {
  const api = useTRPC();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("");

  const email = searchParams.get("email");
  const redirectUrl =
    validateRedirectUrl(searchParams.get("redirectUrl")) ?? "/";

  const resendEmailMutation = useMutation(
    api.users.resendVerificationEmail.mutationOptions({
      onSuccess: () => {
        setMessage(
          "A new verification email has been sent to your email address.",
        );
      },
      onError: (error) => {
        setMessage(error.message || "Failed to resend verification email.");
      },
    }),
  );

  const handleResendEmail = () => {
    if (email) {
      resendEmailMutation.mutate({ email, redirectUrl });
    }
  };

  const handleBackToSignIn = () => {
    router.push("/signin");
  };

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              Invalid Request
            </CardTitle>
            <CardDescription>
              No email address provided. Please try signing up again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleBackToSignIn} className="w-full">
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Check Your Email</CardTitle>
          <CardDescription>
            We&apos;ve sent a verification link to your email address
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center">
            <Mail className="h-12 w-12 text-blue-600" />
          </div>

          <div className="space-y-2 text-center">
            <p className="text-sm text-muted-foreground">
              We&apos;ve sent a verification email to:
            </p>
            <p className="font-medium text-foreground">{email}</p>
            <p className="text-sm text-muted-foreground">
              Click the link in the email to verify your account and complete
              your registration.
            </p>
          </div>

          {message && (
            <Alert>
              <AlertDescription className="text-center">
                {message}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Button
              onClick={handleResendEmail}
              variant="outline"
              className="w-full"
              disabled={resendEmailMutation.isPending}
            >
              {resendEmailMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Resend Verification Email"
              )}
            </Button>
            <Button
              onClick={handleBackToSignIn}
              variant="ghost"
              className="w-full"
            >
              Back to Sign In
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
