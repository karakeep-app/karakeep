import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";

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

export function BookmarkListsField({ bookmarkId }: { bookmarkId: string }) {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const demoMode = !!useClientConfig().demoMode;
  const [open, setOpen] = useState(false);

  const membershipKey = api.lists.getListsOfBookmark.queryKey({ bookmarkId });
  const { data } = useQuery(
    api.lists.getListsOfBookmark.queryOptions({ bookmarkId }),
  );
  const { data: allLists } = useBookmarkLists(undefined, { enabled: open });

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

  const memberIds = new Set(data?.lists.map((list) => list.id));

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
    <div className="flex flex-wrap items-center gap-1.5 max-sm:gap-y-3 [@media(pointer:coarse)]:gap-y-3">
      {data?.lists.map((list) => (
        <Link
          key={list.id}
          href={`/dashboard/lists/${list.id}`}
          title={list.name}
          className="relative inline-flex h-8 max-w-full items-center gap-1 rounded-full bg-accent px-3 text-sm text-foreground outline-none hover:bg-accent/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:after:absolute max-sm:after:-inset-y-1.5 max-sm:after:inset-x-0 [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-y-1.5 [@media(pointer:coarse)]:after:inset-x-0"
        >
          <span aria-hidden>{list.icon}</span>
          <span className="truncate">{list.name}</span>
        </Link>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="none"
            disabled={demoMode}
            className="relative h-8 gap-1 rounded-full px-2 text-sm font-normal text-muted-foreground hover:text-foreground max-sm:after:absolute max-sm:after:-inset-y-1.5 max-sm:after:inset-x-0 [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-y-1.5 [@media(pointer:coarse)]:after:inset-x-0"
          >
            <Plus className="size-4" />
            {t("preview.lists_add")}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={8}
          className="w-72 p-0"
          onWheel={(e) => e.stopPropagation()}
        >
          <Command filter={filterByName}>
            <CommandInput placeholder={t("preview.lists_search")} />
            <CommandList className="max-h-64">
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
