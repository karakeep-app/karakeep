"use client";

import { useEffect, useState } from "react";
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

import {
  isMobileAppRedirect,
  validateRedirectUrl,
} from "@karakeep/shared/utils/redirectUrl";
import { CheckCircle, Loader2, XCircle } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";

export default function VerifyEmailPage() {
  const api = useTRPC();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const redirectUrl = validateRedirectUrl(searchParams.get("redirectUrl")) ?? "/";

  const verifyEmailMutation = useMutation(
    api.users.verifyEmail.mutationOptions({
      onSuccess: () => {
        setStatus("success");
        if (isMobileAppRedirect(redirectUrl)) {
          setMessage(
            "Your email has been successfully verified! Redirecting to the app...",
          );
          // Redirect to mobile app after a brief delay
          setTimeout(() => {
            window.location.href = redirectUrl;
          }, 1500);
        } else {
          setMessage(
            "Your email has been successfully verified! You can now sign in.",
          );
        }
      },
      onError: (error) => {
        setStatus("error");
        setMessage(
          error.message ||
            "Failed to verify email. The link may be invalid or expired.",
        );
      },
    }),
  );

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

  const isMobileRedirect = isMobileAppRedirect(redirectUrl);

  useEffect(() => {
    if (token && email) {
      verifyEmailMutation.mutate({ token, email });
    } else {
      setStatus("error");
      setMessage("Invalid verification link. Missing token or email.");
    }
  }, [token, email]);

  const handleResendEmail = () => {
    if (email) {
      resendEmailMutation.mutate({ email, redirectUrl });
    }
  };

  const handleSignIn = () => {
    if (isMobileRedirect) {
      window.location.href = redirectUrl;
    } else if (redirectUrl !== "/") {
      router.push(`/signin?redirectUrl=${encodeURIComponent(redirectUrl)}`);
    } else {
      router.push("/signin");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            Email Verification
          </CardTitle>
          <CardDescription>
            {status === "loading" && "Verifying your email address..."}
            {status === "success" && "Email verified successfully!"}
            {status === "error" && "Verification failed"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          )}

          {status === "success" && (
            <>
              <div className="flex items-center justify-center">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
              <Alert>
                <AlertDescription className="text-center">
                  {message}
                </AlertDescription>
              </Alert>
              <Button onClick={handleSignIn} className="w-full">
                {isMobileRedirect ? "Open App" : "Sign In"}
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <div className="flex items-center justify-center">
                <XCircle className="h-12 w-12 text-red-600" />
              </div>
              <Alert variant="destructive">
                <AlertDescription className="text-center">
                  {message}
                </AlertDescription>
              </Alert>
              {email && (
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
                    onClick={handleSignIn}
                    variant="ghost"
                    className="w-full"
                  >
                    Back to Sign In
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
