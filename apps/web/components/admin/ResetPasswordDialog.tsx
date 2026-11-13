import { useEffect } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useTRPC } from "@karakeep/shared-react/trpc"; // Adjust the import path as needed

import { resetPasswordSchema } from "@karakeep/shared/types/admin";

interface ResetPasswordDialogProps {
  userId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  onCloseAutoFocus?: (e: Event) => void;
}

type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordDialog({
  userId,
  open: isOpen,
  setOpen: onOpenChange,
  onCloseAutoFocus,
}: ResetPasswordDialogProps) {
  const { t } = useTranslation();
  const api = useTRPC();
  const form = useForm<ResetPasswordSchema>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      userId,
      newPassword: "",
      newPasswordConfirm: "",
    },
  });
  const { mutate, isPending } = useMutation(
    api.admin.resetPassword.mutationOptions({
      onSuccess: () => {
        toast({
          description: "Password reset successfully",
        });
        onOpenChange(false);
      },
      onError: (error) => {
        if (error instanceof TRPCClientError) {
          toast({
            variant: "destructive",
            description: error.message,
          });
        } else {
          toast({
            variant: "destructive",
            description: "Failed to reset password",
          });
        }
      },
    }),
  );

  useEffect(() => {
    if (isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{t("admin.users_list.reset_password")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((val) => mutate(val))}>
            <div className="flex w-full flex-col space-y-2">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.info.new_password")}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={t("settings.info.new_password")}
                        {...field}
                        className="w-full rounded border p-2"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPasswordConfirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("settings.info.confirm_new_password")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={t("settings.info.confirm_new_password")}
                        {...field}
                        className="w-full rounded border p-2"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="sm:justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </DialogClose>
                <ActionButton
                  type="submit"
                  loading={isPending}
                  disabled={isPending}
                >
                  Reset
                </ActionButton>
              </DialogFooter>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
