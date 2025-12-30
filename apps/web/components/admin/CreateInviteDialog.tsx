"use client";

import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { api } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { TRPCClientError } from "@trpc/client";
import { useForm } from "react-hook-form";
import { z } from "zod";

const createInviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

interface CreateInviteDialogProps {
  children: React.ReactNode;
}

export default function CreateInviteDialog({
  children,
}: CreateInviteDialogProps) {
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const form = useForm<z.infer<typeof createInviteSchema>>({
    resolver: zodResolver(createInviteSchema),
    defaultValues: {
      email: "",
    },
  });

  const invalidateInvitesList = api.useUtils().invites.list.invalidate;
  const createInviteMutation = api.invites.create.useMutation({
    onSuccess: () => {
      toast({
        description: "Invite sent successfully",
      });
      invalidateInvitesList();
      setOpen(false);
      form.reset();
      setErrorMessage("");
    },
    onError: (e) => {
      if (e instanceof TRPCClientError) {
        setErrorMessage(e.message);
      } else {
        setErrorMessage("Failed to send invite");
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send User Invitation</DialogTitle>
          <DialogDescription>
            Send an invitation to a new user to join Karakeep. They&apos;ll
            receive an email with instructions to create their account and will
            be assigned the &quot;user&quot; role.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (value) => {
              setErrorMessage("");
              await createInviteMutation.mutateAsync(value);
            })}
            className="space-y-4"
          >
            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2">
              <ActionButton
                type="button"
                variant="outline"
                loading={false}
                onClick={() => setOpen(false)}
              >
                Cancel
              </ActionButton>
              <ActionButton
                type="submit"
                loading={createInviteMutation.isPending}
              >
                Send Invitation
              </ActionButton>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
