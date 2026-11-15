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
  FormMessage,
} from "@/components/ui/form";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useAddBookmarkToList } from "@karakeep/shared-react/hooks/lists";
import { limitConcurrency } from "@karakeep/shared/concurrency";

import { BookmarkListSelector } from "../lists/BookmarkListSelector";

export default function BulkManageListsModal({
  bookmarkIds,
  open,
  setOpen,
}: {
  bookmarkIds: string[];
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formSchema = z.object({
    listId: z.string({
      error: (issue) =>
        issue.input === undefined ? "Please select a list" : undefined,
    }),
  });
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      listId: undefined,
    },
  });

  const { mutateAsync: addToList, isPending: isAddingToListPending } =
    useAddBookmarkToList({
      onSettled: () => {
        form.resetField("listId");
      },
      onError: (e) => {
        if (e.data?.code == "BAD_REQUEST") {
          toast({
            variant: "destructive",
            description: e.message,
          });
        } else {
          toast({
            variant: "destructive",
            title: t("common.something_went_wrong"),
          });
        }
      },
    });

  const onSubmit = async (value: z.infer<typeof formSchema>) => {
    const results = await Promise.allSettled(
      limitConcurrency(
        bookmarkIds.map(
          (bookmarkId) => () =>
            addToList({
              bookmarkId,
              listId: value.listId,
            }),
        ),
        50,
      ),
    );

    const successes = results.filter((r) => r.status == "fulfilled").length;
    if (successes > 0) {
      toast({
        description: t("toasts.bookmarks.bulk_added_to_list", {
          count: successes,
        }),
      });
    }

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <DialogHeader>
              <DialogTitle>
                {t("dialogs.bookmarks.bulk_add_to_list_title", {
                  count: bookmarkIds.length,
                })}
              </DialogTitle>
            </DialogHeader>

            <FormField
              control={form.control}
              name="listId"
              render={({ field }) => {
                return (
                  <FormItem>
                    <FormControl>
                      <BookmarkListSelector
                        value={field.value}
                        onChange={field.onChange}
                        listTypes={["manual"]}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <DialogFooter className="sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              <ActionButton
                type="submit"
                loading={isAddingToListPending}
                disabled={isAddingToListPending}
              >
                {t("actions.add")}
              </ActionButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
