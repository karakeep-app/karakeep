"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/lib/auth/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { humanAuthErrors } from "./authFormErrors";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export default function ForgotPasswordForm() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  const form = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema, humanAuthErrors),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof forgotPasswordSchema>) => {
    setErrorMessage("");
    const result = await requestPasswordReset(values.email);
    if (!result.ok) {
      setErrorMessage(
        result.error ?? "An unexpected error occurred. Please try again.",
      );
      return;
    }
    setIsSubmitted(true);
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-xl font-semibold">
          {isSubmitted ? "Check your email" : "Forgot your password?"}
        </CardTitle>
        <CardDescription>
          {isSubmitted
            ? "If an account with that email exists, we've sent you a password reset link."
            : "Enter your email address and we'll send you a link to reset your password."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isSubmitted ? (
          <>
            <div className="flex items-center justify-center">
              <CheckCircle className="size-10 text-green-500" />
            </div>
            <ActionButton
              variant="outline"
              loading={false}
              onClick={() => router.push("/signin")}
              className="w-full"
            >
              Back to sign in
            </ActionButton>
          </>
        ) : (
          <>
            <Form {...form}>
              <form
                noValidate
                onSubmit={form.handleSubmit(onSubmit)}
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
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          spellCheck={false}
                          placeholder="Enter your email address"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <ActionButton
                  type="submit"
                  loading={form.formState.isSubmitting}
                  className="w-full"
                >
                  Send reset link
                </ActionButton>
              </form>
            </Form>

            <div className="text-center">
              <ActionButton
                variant="ghost"
                loading={false}
                onClick={() => router.push("/signin")}
                className="w-full"
              >
                Back to sign in
              </ActionButton>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
