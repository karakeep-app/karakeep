"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  useDeleteAccount,
  useWhoAmI,
} from "@karakeep/shared-react/hooks/users";

import { Button } from "../ui/button";
import { destructiveTextClass } from "./RowActions";
import { SettingsSection } from "./SettingsPage";

const createDeleteAccountSchema = (
  isLocalUser: boolean,
  passwordRequired: string,
) =>
  z.object({
    password: isLocalUser
      ? z.string().min(1, passwordRequired)
      : z.string().optional(),
  });

export function DeleteAccount() {
  const { t } = useTranslation();
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: user } = useWhoAmI();

  const isLocalUser = user?.localUser ?? false;
  const deleteAccountSchema = createDeleteAccountSchema(
    isLocalUser,
    t("settings.info.delete_account.password_required"),
  );

  const form = useForm<z.infer<typeof deleteAccountSchema>>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: {
      password: "",
    },
  });

  const deleteAccountMutation = useDeleteAccount({
    onSuccess: () => {
      setServerError(null);
      toast({
        description: t("settings.info.delete_account.deleted"),
      });
      // Redirect to home page after successful deletion
      router.push("/");
      setIsDialogOpen(false);
    },
    onError: (error) => {
      if (error.data?.code === "UNAUTHORIZED") {
        form.setError("password", {
          type: "server",
          message: t("settings.info.delete_account.invalid_password"),
        });
        setServerError(null);
        return;
      }

      if (error.data?.code === "BAD_REQUEST") {
        setServerError(error.message);
        return;
      }

      toast({
        description: t("settings.info.delete_account.failed"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: z.infer<typeof deleteAccountSchema>) => {
    setServerError(null);
    form.clearErrors();
    deleteAccountMutation.mutate({ password: values.password });
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setServerError(null);
      form.clearErrors();
    }
  };

  return (
    <SettingsSection
      title={t("settings.info.delete_account.title")}
      description={t("settings.info.delete_account.description")}
      action={
        <ActionConfirmingDialog
          open={isDialogOpen}
          setOpen={handleDialogOpenChange}
          title={t("settings.info.delete_account.dialog_title")}
          description={
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="space-y-2">
                  <p className="font-medium text-destructive">
                    {t("settings.info.delete_account.irreversible")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.info.delete_account.irreversible_description")}
                  </p>
                </div>
              </div>
              {serverError && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              )}

              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4 text-foreground"
                >
                  {isLocalUser && (
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t("settings.info.delete_account.confirm_password")}
                          </FormLabel>
                          <FormControl>
                            <PasswordInput
                              autoComplete="current-password"
                              placeholder={t(
                                "settings.info.delete_account.password_placeholder",
                              )}
                              {...field}
                            />
                          </FormControl>
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
              <Trash2 className="size-4" />
              {t("settings.info.delete_account.title")}
            </ActionButton>
          )}
        >
          <Button variant="outline" className={destructiveTextClass}>
            <Trash2 className="size-4" />
            {t("settings.info.delete_account.title")}
          </Button>
        </ActionConfirmingDialog>
      }
    />
  );
}
