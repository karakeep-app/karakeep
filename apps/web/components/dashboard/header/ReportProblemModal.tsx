"use client";

import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { api } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Please describe the problem")
    .max(5000, "Message is too long"),
});

interface ReportProblemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportProblemModal({
  open,
  onOpenChange,
}: ReportProblemModalProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      message: "",
    },
  });

  const { mutate: reportProblem, isPending } =
    api.users.reportProblem.useMutation({
      onSuccess: () => {
        toast({
          description:
            "Your problem report has been sent. We'll look into it shortly.",
        });
        onOpenChange(false);
        form.reset();
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          title: "Failed to submit report",
          description: e.message || "Something went wrong. Please try again.",
        });
      },
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) {
          form.reset();
        }
      }}
    >
      <DialogContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => {
              reportProblem(values);
            })}
          >
            <DialogHeader>
              <DialogTitle>Report a Problem</DialogTitle>
              <DialogDescription>
                Let us know what issue you're experiencing and we'll help you
                resolve it.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Please describe the problem you're facing..."
                        className="min-h-[150px]"
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <ActionButton type="submit" loading={isPending}>
                Submit Report
              </ActionButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
