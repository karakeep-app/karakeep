import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSet } from "@uidotdev/usehooks";
import { Check, Plus } from "lucide-react";

import {
  useAutoRefreshingBookmarkQuery,
  useUpdateBookmarkTags,
} from "@karakeep/shared-react/hooks/bookmarks";

import { cn } from "../utils/css";
import { useTRPC } from "../utils/trpc";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import { DynamicPopoverContent } from "./ui/dynamic-popover";
import { Popover, PopoverTrigger } from "./ui/popover";

export function TagsSelector({ bookmarkId }: { bookmarkId: string }) {
  const api = useTRPC();
  const { data: allTags } = useQuery(api.tags.list.queryOptions({}));
  const { data: bookmark } = useAutoRefreshingBookmarkQuery({ bookmarkId });

  const existingTagIds = new Set(bookmark?.tags.map((t) => t.id) ?? []);

  const [input, setInput] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const currentlyUpdating = useSet<string>();

  const { mutate } = useUpdateBookmarkTags({
    onMutate: (req) => {
      req.attach.forEach((t) => currentlyUpdating.add(t.tagId ?? ""));
      req.detach.forEach((t) => currentlyUpdating.add(t.tagId ?? ""));
    },
    onSettled: (_resp, _err, req) => {
      if (!req) {
        return;
      }
      req.attach.forEach((t) => currentlyUpdating.delete(t.tagId ?? ""));
      req.detach.forEach((t) => currentlyUpdating.delete(t.tagId ?? ""));
    },
  });

  const toggleTag = (tagId: string) => {
    mutate({
      bookmarkId,
      attach: existingTagIds.has(tagId) ? [] : [{ tagId }],
      detach: existingTagIds.has(tagId) ? [{ tagId }] : [],
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-7 gap-1 rounded-full border-dashed px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Add tag
        </Button>
      </PopoverTrigger>
      <DynamicPopoverContent
        align="start"
        collisionPadding={16}
        className="w-[320px] p-0"
      >
        <Command>
          <CommandInput
            value={input}
            onValueChange={setInput}
            placeholder="Search or create a tag…"
          />
          <CommandList>
            <CommandEmpty>Type a name to create a tag.</CommandEmpty>
            {input.trim() && (
              <>
                <CommandGroup>
                  <CommandItem
                    onSelect={() =>
                      mutate({
                        bookmarkId,
                        attach: [{ tagName: input.trim() }],
                        detach: [],
                      })
                    }
                  >
                    <Plus className="mr-2 size-4" />
                    Create &quot;{input.trim()}&quot;
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup>
              {allTags?.tags
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((tag) => (
                  <CommandItem
                    key={tag.id}
                    value={tag.id}
                    keywords={[tag.name]}
                    onSelect={toggleTag}
                    disabled={currentlyUpdating.has(tag.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        existingTagIds.has(tag.id)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    {tag.name}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DynamicPopoverContent>
    </Popover>
  );
}
