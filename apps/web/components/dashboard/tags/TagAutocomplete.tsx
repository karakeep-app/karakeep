import React, { useState } from "react";
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
import LoadingSpinner from "@/components/ui/spinner";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { keepPreviousData } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";

interface TagAutocompleteProps {
  tagId: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function TagAutocomplete({
  tagId,
  onChange,
  className,
}: TagAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: tags, isLoading } = api.tags.list.useQuery(
    {
      nameContains: searchQuery,
      limit: 50,
    },
    {
      select: (data) => data.tags,
      placeholderData: keepPreviousData,
    },
  );

  // Filter tags based on search query
  const filteredTags = tags ?? [];

  const handleSelect = (currentValue: string) => {
    setOpen(false);
    onChange?.(currentValue);
  };

  const clearSelection = () => {
    onChange?.("");
  };

  const selectedTag = React.useMemo(() => {
    if (!tagId) return null;
    return tags?.find((t) => t.id === tagId) ?? null;
  }, [tags, tagId]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between", className)}
        >
          {selectedTag ? (
            <div className="flex w-full items-center justify-between">
              <span>{selectedTag.name}</span>
              <X
                className="h-4 w-4 shrink-0 cursor-pointer opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  clearSelection();
                }}
              />
            </div>
          ) : (
            "Select a tag..."
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search tags..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            className={cn("h-9", className)}
          />
          <CommandList>
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup className="max-h-60 overflow-y-auto">
              {filteredTags.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={tag.id}
                  onSelect={handleSelect}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedTag?.id === tag.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {tag.name}
                </CommandItem>
              ))}
              {searchQuery && filteredTags.length >= 10 && (
                <div className="px-2 py-2 text-center text-xs text-muted-foreground">
                  Showing first 10 results. Keep typing to refine your search.
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
