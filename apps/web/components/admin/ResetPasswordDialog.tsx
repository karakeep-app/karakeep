import { useEffect, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { api } from "@/lib/trpc"; // Adjust the import path as needed
import { zodResolver } from "@hookform/resolvers/zod";
import { TRPCClientError } from "@trpc/client";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { resetPasswordSchema } from "@karakeep/shared/types/admin";

interface ResetPasswordDialogProps {
  userId: string;
  children?: React.ReactNode;
}

type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordDialog({
  children,
  userId,
}: ResetPasswordDialogProps) {
  const [isOpen, onOpenChange] = useState(false);
  const form = useForm<ResetPasswordSchema>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      userId,
      newPassword: "",
      newPasswordConfirm: "",
    },
  });
  const { mutate, isPending } = api.admin.resetPassword.useMutation({
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
  });

  useEffect(() => {
    if (isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((val) => mutate(val))}>
            <div className="flex w-full flex-col space-y-2">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="New Password"
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
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Confirm New Password"
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
