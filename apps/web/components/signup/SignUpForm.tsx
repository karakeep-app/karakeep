"use client";

import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { signUp } from "@/lib/auth/client";
import { useClientConfig } from "@/lib/clientConfig";
import { zodResolver } from "@hookform/resolvers/zod";
import { Turnstile } from "@marsidev/react-turnstile";
import { AlertCircle, UserX } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  PASSWORD_MIN_LENGTH,
  zSignUpSchema,
} from "@karakeep/shared/types/users";
import { isMobileAppRedirect } from "@karakeep/shared/utils/redirectUrl";

import { humanAuthErrors } from "../signin/authFormErrors";

interface SignUpFormProps {
  redirectUrl: string;
}

export default function SignUpForm({ redirectUrl }: SignUpFormProps) {
  const form = useForm<z.infer<typeof zSignUpSchema>>({
    resolver: zodResolver(zSignUpSchema, humanAuthErrors),
    defaultValues: {
      email: "",
      name: "",
      password: "",
      confirmPassword: "",
      turnstileToken: "",
    },
  });
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();
  const clientConfig = useClientConfig();
  const turnstileSiteKey = clientConfig.turnstile?.siteKey;
  const turnstileRef = useRef<TurnstileInstance>(null);

  if (
    clientConfig.auth.disableSignups ||
    clientConfig.auth.disablePasswordAuth
  ) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold">
            Sign-up unavailable
          </CardTitle>
          <CardDescription>
            Account registration is currently disabled
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <Alert>
              <UserX className="size-4" />
              <AlertDescription>
                Signups are currently disabled. Please contact an administrator
                for access.
              </AlertDescription>
            </Alert>
            <Button asChild className="w-full">
              <Link href="/signin">Back to sign in</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-xl font-semibold">
          Create your account
        </CardTitle>
        <CardDescription>
          Join Karakeep to start organising your bookmarks
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form
            noValidate
            // POST so a submit before hydration doesn't put the password in the URL.
            method="post"
            onSubmit={form.handleSubmit(async (value) => {
              if (turnstileSiteKey && !value.turnstileToken) {
                form.setError("turnstileToken", {
                  type: "manual",
                  message: "Please complete the verification challenge",
                });
                return;
              }
              form.clearErrors("turnstileToken");
              const email = value.email.trim();
              const resp = await signUp({
                name: value.name,
                email,
                password: value.password,
                callbackUrl: redirectUrl,
                turnstileToken: value.turnstileToken,
              });
              if (!resp.ok) {
                setErrorMessage(
                  resp.error ?? "Hit an unexpected error while signing up",
                );
                // Reset turnstile widget on error to get a new token
                if (turnstileSiteKey) {
                  turnstileRef.current?.reset();
                  form.setValue("turnstileToken", "");
                }
                return;
              }
              if (!resp.signedIn) {
                // The email address has to be verified before signing in.
                router.replace(
                  `/check-email?email=${encodeURIComponent(email)}&redirectUrl=${encodeURIComponent(redirectUrl)}`,
                );
                return;
              }
              if (isMobileAppRedirect(redirectUrl)) {
                window.location.href = redirectUrl;
              } else {
                router.replace(redirectUrl);
              }
            })}
            className="space-y-4"
          >
            {errorMessage && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Enter your full name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      spellCheck={false}
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
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="new-password"
                      placeholder="Create a password"
                      {...field}
                    />
                  </FormControl>
                  {!fieldState.error && (
                    <FormDescription>
                      Use at least {PASSWORD_MIN_LENGTH} characters
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="new-password"
                      placeholder="Confirm your password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {turnstileSiteKey && (
              <FormField
                control={form.control}
                name="turnstileToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification</FormLabel>
                    <FormControl>
                      <Turnstile
                        ref={turnstileRef}
                        siteKey={turnstileSiteKey}
                        onSuccess={(token) => {
                          field.onChange(token);
                          form.clearErrors("turnstileToken");
                        }}
                        onExpire={() => field.onChange("")}
                        onError={() => {
                          field.onChange("");
                          form.setError("turnstileToken", {
                            type: "manual",
                            message:
                              "Verification failed, please reload the challenge",
                          });
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <ActionButton
              type="submit"
              loading={form.formState.isSubmitting}
              className="w-full"
            >
              Sign up
            </ActionButton>

            {(clientConfig.legal.termsOfServiceUrl ||
              clientConfig.legal.privacyPolicyUrl) && (
              <p className="text-center text-xs text-muted-foreground">
                By clicking on &apos;Sign up&apos; above, you are agreeing to
                the{" "}
                {clientConfig.legal.termsOfServiceUrl && (
                  <Link
                    href={clientConfig.legal.termsOfServiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    terms of service
                  </Link>
                )}
                {clientConfig.legal.termsOfServiceUrl &&
                  clientConfig.legal.privacyPolicyUrl &&
                  " and "}
                {clientConfig.legal.privacyPolicyUrl && (
                  <Link
                    href={clientConfig.legal.privacyPolicyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    privacy policy
                  </Link>
                )}
                .
              </p>
            )}
          </form>
        </Form>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/signin"
              className="font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
            >
              Sign in
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
