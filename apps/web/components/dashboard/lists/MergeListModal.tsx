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
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useMergeLists } from "@karakeep/shared-react/hooks/lists";
import { ZBookmarkList, zMergeListSchema } from "@karakeep/shared/types/lists";

import { BookmarkListSelector } from "./BookmarkListSelector";

export function MergeListModal({
  open: userOpen,
  setOpen: userSetOpen,
  list,
  children,
}: {
  open?: boolean;
  setOpen?: (v: boolean) => void;
  list: ZBookmarkList;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  if (
    (userOpen !== undefined && !userSetOpen) ||
    (userOpen === undefined && userSetOpen)
  ) {
    throw new Error("You must provide both open and setOpen or neither");
  }
  const [customOpen, customSetOpen] = useState(false);
  const form = useForm<z.infer<typeof zMergeListSchema>>({
    resolver: zodResolver(zMergeListSchema),
    defaultValues: {
      sourceId: list.id,
      targetId: "",
      deleteSourceAfterMerge: true,
    },
  });
  const [open, setOpen] = [
    userOpen ?? customOpen,
    userSetOpen ?? customSetOpen,
  ];

  useEffect(() => {
    form.reset({
      sourceId: list.id,
      targetId: "",
      deleteSourceAfterMerge: true,
    });
  }, [open]);

  const { mutate: mergeLists, isPending: isMerging } = useMergeLists({
    onSuccess: () => {
      toast({
        description: t("toasts.lists.merged"),
      });
      setOpen(false);
      form.reset();
    },
    onError: (e) => {
      if (e.data?.code == "BAD_REQUEST") {
        if (e.data.zodError) {
          toast({
            variant: "destructive",
            description: Object.values(e.data.zodError.fieldErrors)
              .flat()
              .join("\n"),
          });
        } else {
          toast({
            variant: "destructive",
            description: e.message,
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: t("common.something_went_wrong"),
        });
      }
    },
  });

  const onSubmit = form.handleSubmit(
    async (value: z.infer<typeof zMergeListSchema>) => {
      mergeLists(value);
    },
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(s) => {
        form.reset();
        setOpen(s);
      }}
    >
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent>
        <Form {...form}>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{t("lists.merge_list")}</DialogTitle>
            </DialogHeader>
            <div className="flex w-full gap-2 py-4">
              <span className="inline-flex aspect-square h-10 items-center justify-center rounded border border-input bg-transparent px-2 text-2xl">
                {list.icon}
              </span>
              <Input
                type="text"
                className="w-full"
                value={list.name}
                disabled
              />
            </div>

            <FormField
              control={form.control}
              name="deleteSourceAfterMerge"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between space-x-2 space-y-0 pb-4">
                  <label className="text-xs text-muted-foreground">
                    {t("lists.delete_after_merge")}
                  </label>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetId"
              render={({ field }) => (
                <FormItem className="grow pb-4">
                  <FormLabel>{t("lists.destination_list")}</FormLabel>
                  <div className="flex items-center gap-1">
                    <FormControl>
                      <BookmarkListSelector
                        hideSubtreeOf={list.id}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t("lists.no_destination")}
                        listTypes={["manual"]}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        form.resetField("targetId");
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              <ActionButton
                type="submit"
                onClick={onSubmit}
                loading={isMerging}
              >
                {t("actions.merge")}
              </ActionButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
