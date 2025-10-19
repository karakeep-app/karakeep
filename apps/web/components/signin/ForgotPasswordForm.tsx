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
import { authClient } from "@/lib/auth-client";
import { zodResolver } from "@hookform/resolvers/zod";
import { TRPCClientError } from "@trpc/client";
import { AlertCircle, CheckCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export default function ForgotPasswordForm() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  const form = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (values: z.infer<typeof forgotPasswordSchema>) => {
    try {
      setErrorMessage("");
      await authClient.forgetPassword({
        email: values.email,
      });
      setIsSubmitted(true);
    } catch (error) {
      if (error instanceof TRPCClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("An unexpected error occurred. Please try again.");
      }
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
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
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <Alert>
              <AlertDescription className="text-center">
                If an account with that email exists, we&apos;ve sent you a
                password reset link.
              </AlertDescription>
            </Alert>
            <ActionButton
              variant="outline"
              loading={false}
              onClick={() => router.push("/signin")}
              className="w-full"
            >
              Back to Sign In
            </ActionButton>
          </>
        ) : (
          <>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                {errorMessage && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
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
                  Send Reset Link
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
                Back to Sign In
              </ActionButton>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
