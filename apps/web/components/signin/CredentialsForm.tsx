"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { useClientConfig } from "@/lib/clientConfig";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const SIGNIN_FAILED = "Incorrect email or password";
const OAUTH_FAILED = "OAuth login failed: ";

export default function CredentialsForm() {
  const [signinError, setSigninError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientConfig = useClientConfig();

  const oAuthError = searchParams.get("error");
  if (oAuthError && !signinError) {
    setSigninError(`${OAUTH_FAILED} ${oAuthError}`);
  }

  const form = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
  });

  if (clientConfig.auth.disablePasswordAuth) {
    return (
      <div className="space-y-4">
        {signinError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{signinError}</AlertTitle>
          </Alert>
        )}
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>
            Password authentication is currently disabled.
          </AlertTitle>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(async (value) => {
            const { error: signInError } = await authClient.signIn.email({
              email: value.email.trim(),
              password: value.password,
              rememberMe: true,
            });
            if (signInError) {
              if (signInError.message === "INVALID_EMAIL_OR_PASSWORD") {
                setSigninError(SIGNIN_FAILED);
              } else if (signInError.message === "EMAIL_NOT_VERIFIED") {
                router.replace(
                  `/check-email?email=${encodeURIComponent(value.email.trim())}`,
                );
              } else {
                setSigninError(signInError.message ?? SIGNIN_FAILED);
              }
              return;
            }
            router.replace("/");
          })}
          className="space-y-4"
        >
          {signinError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{signinError}</AlertTitle>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Enter your password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <ActionButton
            ignoreDemoMode
            type="submit"
            loading={form.formState.isSubmitting}
            className="w-full"
          >
            Sign In
          </ActionButton>

          <div className="text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-muted-foreground underline hover:text-primary"
            >
              Forgot your password?
            </Link>
          </div>
        </form>
      </Form>

      <div className="text-center">
        <p className="text-sm text-gray-600">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
