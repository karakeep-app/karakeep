import React, { useRef, useState } from "react";
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
import { selectTriggerClass } from "@/components/ui/select";
import LoadingSpinner from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronsUpDown, Plus, X } from "lucide-react";

import { useTagAutocomplete } from "@karakeep/shared-react/hooks/tags";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { normalizeTagName } from "@karakeep/shared/utils/tag";

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
  const api = useTRPC();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchQueryDebounced = useDebounce(searchQuery, 500);

  const { data: tags, isLoading } = useTagAutocomplete({
    nameContains: searchQueryDebounced,
    select: (data) => data.tags,
  });

  const { data: selectedTag, isLoading: isSelectedTagLoading } = useQuery(
    api.tags.get.queryOptions(
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
    ),
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
                className="!pointer-events-auto h-4 w-4 shrink-0 cursor-pointer opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  clearSelection();
                }}
              />
            </div>
          ) : (
            "Select a tag..."
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
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
                      "h-4 w-4",
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

/**
 * The same search as `TagAutocomplete`, for several tags picked by name: the
 * popover stays open between picks and picking a selected tag removes it. A name
 * that matches no tag can still be picked, it's what a smart list matches on.
 */
export function TagNamePicker({
  id,
  placeholder,
  selectedNames,
  onToggle,
  getTypedNameLabel,
}: {
  id?: string;
  placeholder: string;
  selectedNames: string[];
  onToggle: (name: string) => void;
  getTypedNameLabel: (name: string) => string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Tags are saved without a leading "#", so "#docs" should find "docs".
  const typedName = normalizeTagName(searchQuery);
  const searchQueryDebounced = useDebounce(typedName, 200);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: tags } = useTagAutocomplete({
    nameContains: searchQueryDebounced,
    select: (data) => data.tags,
    enabled: open,
  });

  const query = typedName.toLowerCase();
  // The list shows the previous search's results while the new ones load. The
  // top row gets pre-selected, so Enter shouldn't land on something unrelated.
  const matches = (tags ?? []).filter((tag) =>
    tag.name.toLowerCase().includes(query),
  );
  const offerTypedName =
    typedName.length > 0 &&
    !matches.some((tag) => tag.name.toLowerCase() === query);

  const pick = (name: string) => {
    onToggle(name);
    setSearchQuery("");
    // Clicking a row takes the focus, and the next pick starts with typing.
    inputRef.current?.focus();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSearchQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className={selectTriggerClass}
        >
          <span className="truncate text-muted-foreground/85">
            {placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={8}
        className="w-[--radix-popover-trigger-width] min-w-56 p-0"
        // The dialog around it would otherwise swallow the scrolling.
        onWheel={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            ref={inputRef}
            placeholder={t("tags.search_placeholder")}
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="h-9 max-sm:h-11"
          />
          <CommandList className="max-h-60">
            {matches.length === 0 && !offerTypedName && (
              <CommandEmpty>{t("tags.none_found")}</CommandEmpty>
            )}
            <CommandGroup>
              {matches.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={tag.id}
                  onSelect={() => pick(tag.name)}
                  className="cursor-pointer max-sm:min-h-11"
                >
                  <Check
                    className={cn(
                      "size-4",
                      selectedNames.includes(tag.name)
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  {tag.name}
                </CommandItem>
              ))}
              {offerTypedName && (
                <CommandItem
                  value={`typed:${typedName}`}
                  onSelect={() => pick(typedName)}
                  className="cursor-pointer max-sm:min-h-11"
                >
                  <Plus className="size-4" />
                  {getTypedNameLabel(typedName)}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
