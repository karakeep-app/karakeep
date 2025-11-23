import * as React from "react";
import { useSet } from "@uidotdev/usehooks";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  useAddBookmarkToList,
  useBookmarkLists,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";

import { cn } from "../utils/css";
import { api } from "../utils/trpc";
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
  const currentlyUpdating = useSet<string>();
  const [open, setOpen] = React.useState(false);

  const { mutate: addToList } = useAddBookmarkToList();
  const { mutate: removeFromList } = useRemoveBookmarkFromList();
  const { data: existingLists } = api.lists.getListsOfBookmark.useQuery({
    bookmarkId,
  });

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
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="justify-between"
        >
          Add to List...
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <DynamicPopoverContent className="w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search Lists ..." />
          <CommandList>
            <CommandEmpty>You don&apos;t have any lists.</CommandEmpty>
            <CommandGroup>
              {allLists?.allPaths
                .filter((path) => path[path.length - 1].userRole !== "viewer")
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
                          "mr-2 size-4",
                          existingListIds.has(lastItem.id)
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {path
                        .map((item) => `${item.icon} ${item.name}`)
                        .join(" / ")}
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
