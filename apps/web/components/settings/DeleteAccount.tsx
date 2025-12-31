"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Eye, EyeOff, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  useDeleteAccount,
  useWhoAmI,
} from "@karakeep/shared-react/hooks/users";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

const createDeleteAccountSchema = (isLocalUser: boolean) =>
  z.object({
    password: isLocalUser
      ? z.string().min(1, "Password is required")
      : z.string().optional(),
  });

export function DeleteAccount() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: user } = useWhoAmI();

  const isLocalUser = user?.localUser ?? false;
  const deleteAccountSchema = createDeleteAccountSchema(isLocalUser);

  const form = useForm<z.infer<typeof deleteAccountSchema>>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: {
      password: "",
    },
  });

  const deleteAccountMutation = useDeleteAccount({
    onSuccess: () => {
      toast({
        description: "Your account has been successfully deleted.",
      });
      // Redirect to home page after successful deletion
      router.push("/");
      setIsDialogOpen(false);
    },
    onError: (error) => {
      if (error.data?.code === "UNAUTHORIZED") {
        toast({
          description: "Invalid password. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          description: "Failed to delete account. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const onSubmit = (values: z.infer<typeof deleteAccountSchema>) => {
    deleteAccountMutation.mutate({ password: values.password });
  };

  return (
    <Card className="border-destructive/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Delete Account</h3>
          <p className="text-sm text-muted-foreground">
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </p>
        </div>

        <ActionConfirmingDialog
          open={isDialogOpen}
          setOpen={setIsDialogOpen}
          title="Delete Account"
          description={
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                <div className="space-y-2">
                  <p className="font-medium text-destructive">
                    This action is irreversible
                  </p>
                  <p className="text-sm text-muted-foreground">
                    All your bookmarks, lists, tags, highlights, and other data
                    will be permanently deleted. This cannot be undone.
                  </p>
                </div>
              </div>

              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  {isLocalUser && (
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Enter your password to confirm deletion
                          </FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter your password"
                                className="pr-10"
                                {...field}
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </form>
              </Form>
            </div>
          }
          actionButton={() => (
            <ActionButton
              variant="destructive"
              loading={deleteAccountMutation.isPending}
              onClick={form.handleSubmit(onSubmit)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Account
            </ActionButton>
          )}
        >
          <Button variant="destructive" className="w-full">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Account
          </Button>
        </ActionConfirmingDialog>
      </CardContent>
    </Card>
  );
}
