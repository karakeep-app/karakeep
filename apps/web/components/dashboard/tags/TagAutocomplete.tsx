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
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { useTagAutocomplete } from "@karakeep/shared-react/hooks/tags";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { api } from "@karakeep/shared-react/trpc";

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
  const searchQueryDebounced = useDebounce(searchQuery, 500);

  const { data: tags, isLoading } = useTagAutocomplete({
    nameContains: searchQueryDebounced,
    select: (data) => data.tags,
  });

  const { data: selectedTag, isLoading: isSelectedTagLoading } =
    api.tags.get.useQuery(
      {
        tagId,
      },
      {
        select: ({ id, name }) => ({
          id,
          name,
        }),
        enabled: !!tagId,
      },
    );

  const handleSelect = (currentValue: string) => {
    setOpen(false);
    onChange?.(currentValue);
  };

  const clearSelection = () => {
    onChange?.("");
  };

  if (!tags || isLoading || isSelectedTagLoading) {
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
              {tags.map((tag) => (
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
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
