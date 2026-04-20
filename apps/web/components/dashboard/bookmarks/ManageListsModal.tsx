import { useState } from "react";
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
import { toast } from "@/components/ui/sonner";
import LoadingSpinner from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { Archive, X } from "lucide-react";

import {
  useAddBookmarkToList,
  useBookmarkLists,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";

import { BookmarkListSelector } from "../lists/BookmarkListSelector";
import ArchiveBookmarkButton from "./action-buttons/ArchiveBookmarkButton";

export default function ManageListsModal({
  bookmarkId,
  open,
  setOpen,
}: {
  bookmarkId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();

  const { data: allLists, isPending: isAllListsPending } = useBookmarkLists(
    undefined,
    { enabled: open },
  );

  const { data: alreadyInList, isPending: isAlreadyInListPending } = useQuery(
    api.lists.getListsOfBookmark.queryOptions(
      {
        bookmarkId,
      },
      { enabled: open },
    ),
  );

  const isLoading = isAllListsPending || isAlreadyInListPending;

  const { mutate: addToList, isPending: isAddingToListPending } =
    useAddBookmarkToList({
      onSuccess: () => {
        toast({
          description: t("toasts.lists.updated"),
        });
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

  const { mutate: deleteFromList, isPending: isDeleteFromListPending } =
    useRemoveBookmarkFromList({
      onSuccess: () => {
        toast({
          description: t("toasts.lists.updated"),
        });
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("actions.manage_lists")}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <LoadingSpinner className="my-4" />
        ) : (
          <ul className="flex flex-col gap-2 pb-2 pt-4">
            {alreadyInList?.lists.map((list) => {
              const path = allLists?.getPathById(list.id);
              return (
                <li
                  key={list.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-2 py-1 text-foreground"
                >
                  <p>
                    {path
                      ? path.map((l) => `${l.icon} ${l.name}`).join(" / ")
                      : list.name}
                  </p>
                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={isDeleteFromListPending}
                    onClick={() =>
                      deleteFromList({ bookmarkId, listId: list.id })
                    }
                    aria-label={t("actions.remove_from_list")}
                  >
                    <X className="size-4" />
                  </ActionButton>
                </li>
              );
            })}
          </ul>
        )}

        <div className="pb-4">
          <BookmarkListSelector
            hideBookmarkIds={alreadyInList?.lists.map((l) => l.id)}
            onChange={(listId) => {
              if (!isLoading && !isAddingToListPending) {
                addToList({
                  bookmarkId: bookmarkId,
                  listId: listId,
                });
              }
            }}
            listTypes={["manual"]}
            disabled={isLoading || isAddingToListPending}
          />
        </div>
        <DialogFooter className="sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("actions.close")}
            </Button>
          </DialogClose>
          <ArchiveBookmarkButton
            type="button"
            bookmarkId={bookmarkId}
            onDone={() => setOpen(false)}
          >
            <Archive className="mr-2 size-4" /> {t("actions.archive")}
          </ArchiveBookmarkButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useManageListsModal(bookmarkId: string) {
  const [open, setOpen] = useState(false);

  return {
    open,
    setOpen,
    content: open && (
      <ManageListsModal bookmarkId={bookmarkId} open={open} setOpen={setOpen} />
    ),
  };
}
