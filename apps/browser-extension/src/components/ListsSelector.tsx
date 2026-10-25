import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSet } from "@uidotdev/usehooks";
import { Check, Plus } from "lucide-react";

import {
  useAddBookmarkToList,
  useBookmarkLists,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";

import { cn } from "../utils/css";
import { useTRPC } from "../utils/trpc";
import { byListPathName, ListPathLabel } from "./BookmarkLists";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { DynamicPopoverContent } from "./ui/dynamic-popover";
import { Popover, PopoverTrigger } from "./ui/popover";

export function ListsSelector({ bookmarkId }: { bookmarkId: string }) {
  const api = useTRPC();
  const currentlyUpdating = useSet<string>();
  const [open, setOpen] = React.useState(false);

  const { mutate: addToList } = useAddBookmarkToList();
  const { mutate: removeFromList } = useRemoveBookmarkFromList();
  const { data: existingLists } = useQuery(
    api.lists.getListsOfBookmark.queryOptions({
      bookmarkId,
    }),
  );

  const { data: allLists } = useBookmarkLists();

  const existingListIds = new Set(existingLists?.lists.map((list) => list.id));

  const toggleList = (listId: string) => {
    currentlyUpdating.add(listId);
    if (existingListIds.has(listId)) {
      removeFromList(
        { bookmarkId, listId },
        {
          onSettled: (_resp, _err, req) => currentlyUpdating.delete(req.listId),
        },
      );
    } else {
      addToList(
        { bookmarkId, listId },
        {
          onSettled: (_resp, _err, req) => currentlyUpdating.delete(req.listId),
        },
      );
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className="h-11 w-full justify-start gap-2 rounded-none px-3 font-normal text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" />
          Add to list
        </Button>
      </PopoverTrigger>
      <DynamicPopoverContent
        align="start"
        collisionPadding={16}
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <Command>
          <CommandInput placeholder="Search lists…" />
          <CommandList>
            <CommandEmpty>No lists found.</CommandEmpty>
            <CommandGroup>
              {allLists?.allPaths
                .filter((path) => path[path.length - 1].userRole !== "viewer")
                // Smart lists are query-based; bookmarks can't be added by hand.
                .filter((path) => path[path.length - 1].type !== "smart")
                .sort(byListPathName)
                .map((path) => {
                  const lastItem = path[path.length - 1];

                  return (
                    <CommandItem
                      key={lastItem.id}
                      value={lastItem.id}
                      keywords={[lastItem.name, lastItem.icon]}
                      onSelect={toggleList}
                      disabled={currentlyUpdating.has(lastItem.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4 shrink-0",
                          existingListIds.has(lastItem.id)
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      <ListPathLabel path={path} />
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DynamicPopoverContent>
    </Popover>
  );
}
