"use client";

import type { z } from "zod";
import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
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
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useForm } from "react-hook-form";

import { zChangePasswordSchema } from "@karakeep/shared/types/users";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export function ChangePassword() {
  const { t } = useTranslation();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const form = useForm<z.infer<typeof zChangePasswordSchema>>({
    resolver: zodResolver(zChangePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      newPasswordConfirm: "",
    },
  });

  const mutator = api.users.changePassword.useMutation({
    onSuccess: () => {
      toast({ description: "Password changed successfully" });
      form.reset();
    },
    onError: (e) => {
      if (e.data?.code == "UNAUTHORIZED") {
        toast({
          description: "Your current password is incorrect",
          variant: "destructive",
        });
      } else {
        toast({ description: "Something went wrong", variant: "destructive" });
      }
    },
  });

  async function onSubmit(value: z.infer<typeof zChangePasswordSchema>) {
    mutator.mutate({
      currentPassword: value.currentPassword,
      newPassword: value.newPassword,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Lock className="h-5 w-5" />
          Security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel
                    htmlFor="current-password"
                    className="text-sm font-medium"
                  >
                    {t("settings.info.current_password")}
                  </FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        id="current-password"
                        type={showCurrentPassword ? "text" : "password"}
                        placeholder={t("settings.info.current_password")}
                        className="h-11 pr-10"
                        {...field}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() =>
                        setShowCurrentPassword(!showCurrentPassword)
                      }
                    >
                      {showCurrentPassword ? (
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

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel
                      htmlFor="new-password"
                      className="text-sm font-medium"
                    >
                      {t("settings.info.new_password")}
                    </FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          id="new-password"
                          type={showNewPassword ? "text" : "password"}
                          placeholder={t("settings.info.new_password")}
                          className="h-11 pr-10"
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
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

              <FormField
                control={form.control}
                name="newPasswordConfirm"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel
                      htmlFor="confirm-password"
                      className="text-sm font-medium"
                    >
                      {t("settings.info.confirm_new_password")}
                    </FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          id="confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder={t("settings.info.confirm_new_password")}
                          className="h-11 pr-10"
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                      >
                        {showConfirmPassword ? (
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
            </div>

            <div className="flex justify-end">
              <ActionButton type="submit" loading={mutator.isPending}>
                {t("actions.save")}
              </ActionButton>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
