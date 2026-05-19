"use client";

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
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useUpdateTag } from "@karakeep/shared-react/hooks/tags";

const formSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required"),
});

export function RenameTagModal({
  tag,
  open,
  setOpen,
}: {
  tag: { id: string; name: string };
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: tag.name },
  });

  useEffect(() => {
    if (open) {
      form.reset({ name: tag.name });
    }
  }, [open, tag.name, form]);

  const { mutate: updateTag, isPending } = useUpdateTag({
    onSuccess: () => {
      toast({ description: t("toasts.tags.updated") });
      setOpen(false);
    },
    onError: (e) => {
      toast({ variant: "destructive", description: e.message });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          form.reset({ name: tag.name });
        }
      }}
    >
      <DialogContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => {
              updateTag({ tagId: tag.id, name: values.name });
            })}
          >
            <DialogHeader>
              <DialogTitle>{t("tags.rename_tag")}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("tags.tag_name")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("tags.enter_tag_name")}
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
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              <ActionButton type="submit" loading={isPending}>
                {t("actions.save")}
              </ActionButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
