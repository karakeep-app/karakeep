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

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@karakeep/shared/types/users";

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

interface ResetPasswordFormProps {
  token: string;
}

export default function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (values: z.infer<typeof resetPasswordSchema>) => {
    try {
      setErrorMessage("");
      await authClient.resetPassword({
        token,
        newPassword: values.newPassword,
      });
      setIsSuccess(true);
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
          {isSuccess ? "Password reset successful" : "Reset your password"}
        </CardTitle>
        <CardDescription>
          {isSuccess
            ? "Your password has been successfully reset. You can now sign in with your new password."
            : "Enter your new password below."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isSuccess ? (
          <>
            <div className="flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <Alert>
              <AlertDescription className="text-center">
                Your password has been successfully reset. You can now sign in
                with your new password.
              </AlertDescription>
            </Alert>
            <ActionButton
              loading={false}
              onClick={() => router.push("/signin")}
              className="w-full"
            >
              Go to Sign In
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
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your new password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Confirm your new password"
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
                  Reset Password
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
