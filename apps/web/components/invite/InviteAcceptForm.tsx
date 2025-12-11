"use client";

import { useEffect, useState } from "react";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { TRPCClientError } from "@trpc/client";
import { AlertCircle, Clock, Loader2, Mail, UserPlus } from "lucide-react";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const inviteAcceptSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z
      .string()
      .min(8, "Password must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

interface InviteAcceptFormProps {
  token: string;
}

export default function InviteAcceptForm({ token }: InviteAcceptFormProps) {
  const router = useRouter();

  const form = useForm<z.infer<typeof inviteAcceptSchema>>({
    resolver: zodResolver(inviteAcceptSchema),
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    isPending: loading,
    data: inviteData,
    error,
  } = api.invites.get.useQuery({ token });

  useEffect(() => {
    if (error) {
      setErrorMessage(error.message);
    }
  }, [error]);

  const acceptInviteMutation = api.invites.accept.useMutation();

  const handleBackToSignIn = () => {
    router.push("/signin");
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            Loading Invitation
          </CardTitle>
          <CardDescription>
            Please wait while we verify your invitation...
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!inviteData) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            Invalid Invitation
          </CardTitle>
          <CardDescription>
            This invitation link is not valid or has been removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <Button onClick={handleBackToSignIn} className="w-full">
            Back to Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (inviteData.expired) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            Invitation Expired
          </CardTitle>
          <CardDescription>
            This invitation link has expired and is no longer valid.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center">
            <Clock className="h-12 w-12 text-orange-500" />
          </div>

          <div className="space-y-2 text-center">
            <p className="text-sm text-muted-foreground">
              Please contact an administrator to request a new invitation.
            </p>
          </div>

          <Button
            onClick={handleBackToSignIn}
            variant="outline"
            className="w-full"
          >
            Back to Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          Accept Your Invitation
        </CardTitle>
        <CardDescription>
          Complete your account setup to join Karakeep
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-center">
          <UserPlus className="h-12 w-12 text-primary" />
        </div>

        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center space-x-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Invited email:</p>
          </div>
          <p className="font-medium text-foreground">{inviteData.email}</p>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (value) => {
              try {
                await acceptInviteMutation.mutateAsync({
                  token,
                  name: value.name,
                  password: value.password,
                });

                // Sign in the user after successful account creation
                const resp = await signIn("credentials", {
                  redirect: false,
                  email: inviteData.email,
                  password: value.password,
                });

                if (!resp || !resp.ok || resp.error) {
                  setErrorMessage(
                    resp?.error ??
                      "Account created but sign in failed. Please try signing in manually.",
                  );
                  return;
                }

                router.replace("/");
              } catch (e) {
                if (e instanceof TRPCClientError) {
                  setErrorMessage(e.message);
                } else {
                  setErrorMessage("An unexpected error occurred");
                }
              }
            })}
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
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
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Create a password"
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
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Confirm your password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <ActionButton
              type="submit"
              loading={
                form.formState.isSubmitting || acceptInviteMutation.isPending
              }
              className="w-full"
            >
              {form.formState.isSubmitting || acceptInviteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                "Create Account & Sign In"
              )}
            </ActionButton>

            <Button
              type="button"
              variant="ghost"
              onClick={handleBackToSignIn}
              className="w-full"
            >
              Back to Sign In
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
