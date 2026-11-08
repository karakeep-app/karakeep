import { useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import LoadingSpinner from "@/components/ui/spinner";
import { useClientConfig } from "@/lib/clientConfig";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  useAddBookmarkToList,
  useBookmarkLists,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { listNameFromPath } from "@karakeep/shared/utils/listUtils";

/** Matches on list names only, as an item's value is its id. */
function filterByName(_value: string, search: string, keywords?: string[]) {
  const name = keywords?.join(" ").toLowerCase() ?? "";
  return name.includes(search.trim().toLowerCase()) ? 1 : 0;
}

/** The same search and check list as the preview's lists field. */
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
  const queryClient = useQueryClient();
  const demoMode = !!useClientConfig().demoMode;
  const isTouch = useMediaQuery("(pointer: coarse)");

  const { data: allLists, isPending: isAllListsPending } = useBookmarkLists(
    undefined,
    { enabled: open },
  );

  const membershipKey = api.lists.getListsOfBookmark.queryKey({ bookmarkId });
  const { data: membership, isPending: isMembershipPending } = useQuery(
    api.lists.getListsOfBookmark.queryOptions(
      { bookmarkId },
      { enabled: open },
    ),
  );

  const onError = (e: { data?: { code?: string } | null; message: string }) => {
    // Takes back the optimistic change.
    queryClient.invalidateQueries({ queryKey: membershipKey });
    if (e.data?.code === "BAD_REQUEST") {
      toast({ variant: "destructive", description: e.message });
    } else {
      toast({
        variant: "destructive",
        title: t("common.something_went_wrong"),
      });
    }
  };
  // A list's next toggle waits for its last one, or a quick check then uncheck
  // could reach the server out of order and leave the bookmark in the list.
  const pendingListIds = useRef(new Set<string>());
  const onSettled = (_res: unknown, _err: unknown, req: { listId: string }) => {
    pendingListIds.current.delete(req.listId);
  };
  const { mutate: addToList } = useAddBookmarkToList({ onError, onSettled });
  const { mutate: removeFromList } = useRemoveBookmarkFromList({
    onError,
    onSettled,
  });

  const memberIds = new Set(membership?.lists.map((list) => list.id));

  // Only manual lists take bookmarks by hand, and viewers can't change them.
  const editablePaths = allLists?.allPaths.filter((path) => {
    const list = path[path.length - 1];
    return list.type === "manual" && list.userRole !== "viewer";
  });

  const toggle = (list: ZBookmarkList) => {
    if (pendingListIds.current.has(list.id)) {
      return;
    }
    pendingListIds.current.add(list.id);
    const isMember = memberIds.has(list.id);
    queryClient.setQueryData(membershipKey, (old) =>
      old
        ? {
            ...old,
            lists: isMember
              ? old.lists.filter((l) => l.id !== list.id)
              : [...old.lists, list],
          }
        : old,
    );
    const mutate = isMember ? removeFromList : addToList;
    mutate({ bookmarkId, listId: list.id });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-sm"
        // The search takes the focus once it's there, rather than the close button
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-4 pr-12">
          <DialogTitle>{t("actions.manage_lists")}</DialogTitle>
        </DialogHeader>
        {isAllListsPending || isMembershipPending ? (
          <LoadingSpinner className="my-4" />
        ) : (
          <Command filter={filterByName} className="bg-transparent">
            <div className="border-t">
              <CommandInput
                placeholder={t("preview.lists_search")}
                // On touch screens the keyboard would cover the list to pick from
                autoFocus={!isTouch}
              />
            </div>
            <CommandList className="max-h-72">
              <CommandEmpty>{t("preview.lists_none_found")}</CommandEmpty>
              <CommandGroup>
                {editablePaths?.map((path) => {
                  const list = path[path.length - 1];
                  const name = listNameFromPath(path);
                  const isMember = memberIds.has(list.id);
                  return (
                    <CommandItem
                      key={list.id}
                      value={list.id}
                      keywords={[name]}
                      aria-checked={isMember}
                      disabled={demoMode}
                      className="cursor-pointer max-sm:min-h-11 [@media(pointer:coarse)]:min-h-11"
                      onSelect={() => toggle(list)}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input",
                          isMember && "border-primary bg-primary",
                        )}
                      >
                        {isMember && (
                          <Check className="!size-3 text-primary-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 truncate">{name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
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
