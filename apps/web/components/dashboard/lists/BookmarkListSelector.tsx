import { ReactNode, useState } from "react";
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

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { ZBookmarkList } from "@karakeep/shared/types/lists";
import { listNameFromPath } from "@karakeep/shared/utils/listUtils";

interface DataProps {
  isPending: boolean;
  allPaths?: ZBookmarkList[][];
}

interface ListSelectorComponentProps extends DataProps {
  onSelect: (value: string) => void;
  isItemSelected: (id: string) => boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}

interface SingleSelectionProps {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  multiSelect?: false;
  disabled?: boolean;
}

interface MultiSelectionProps {
  value: string[] | null;
  onChange: (value: string[]) => void;
  multiSelect: true;
  placeholder?: string;
  className?: string;
}

interface SelectionProps {
  hideSubtreeOf?: string;
  hideBookmarkIds?: string[];
  listTypes?: ZBookmarkList["type"][];
  disabled?: boolean;
}

type BookmarkListSelectorProps = SelectionProps &
  (SingleSelectionProps | MultiSelectionProps);

function ListSelectorComponent({
  onSelect,
  children,
  isItemSelected,
  open,
  setOpen,
  isPending,
  allPaths,
  disabled,
}: ListSelectorComponentProps) {
  if (isPending) {
    return <LoadingSpinner />;
  }

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(nextOpen) => {
        if (!disabled) {
          setOpen(nextOpen);
        }
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Search lists..." />
          <CommandList>
            <CommandEmpty>
              {allPaths && allPaths.length === 0
                ? "You don't currently have any lists."
                : "No lists found."}
            </CommandEmpty>
            <CommandGroup className="max-h-60 overflow-y-auto">
              {allPaths?.map((path) => {
                const l = path[path.length - 1];
                const name = listNameFromPath(path);
                return (
                  <CommandItem
                    key={l.id}
                    value={l.id}
                    keywords={[l.name, l.icon]}
                    onSelect={onSelect}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isItemSelected(l.id) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function BookmarkListSingleSelector({
  placeholder = "Select a list",
  className,
  onChange,
  value,
  isPending,
  allPaths,
  disabled,
}: SingleSelectionProps & DataProps) {
  const [open, setOpen] = useState(false);
  const onSelect = (currentValue: string) => {
    onChange(currentValue);
    setOpen(false);
  };

  const isItemSelected = (id: string) => id === value;

  // Find the selected list's display name
  const selectedListPath = allPaths?.find(
    (path) => path[path.length - 1].id === value,
  );
  const selectedListName = selectedListPath
    ? listNameFromPath(selectedListPath)
    : null;
  return (
    <ListSelectorComponent
      onSelect={onSelect}
      open={open}
      isItemSelected={isItemSelected}
      setOpen={setOpen}
      isPending={isPending}
      allPaths={allPaths}
      disabled={disabled}
    >
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className={cn("w-full justify-between", className)}
        disabled={disabled}
      >
        {selectedListName || placeholder}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    </ListSelectorComponent>
  );
}

function BookmarkListMultiSelector({
  placeholder = "Select lists",
  onChange,
  value,
  isPending,
  allPaths,
  className,
  disabled,
}: MultiSelectionProps & DataProps & { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const onSelect = (currentValue: string) => {
    if (disabled) {
      return;
    }
    const newValue = value?.includes(currentValue)
      ? value.filter((id) => id !== currentValue)
      : [...(value ?? []), currentValue];
    onChange(newValue);
  };
  const removeSelection = (removedId?: string) => {
    if (!disabled && value && removedId) {
      onChange(value.filter((id) => id !== removedId));
    }
  };

  const isItemSelected = (id: string) => !!value?.includes(id);

  const selectedListsPaths = allPaths?.filter((path) =>
    value?.includes(path[path.length - 1].id),
  );
  return (
    <ListSelectorComponent
      onSelect={onSelect}
      open={open}
      isItemSelected={isItemSelected}
      setOpen={setOpen}
      isPending={isPending}
      allPaths={allPaths}
      disabled={disabled}
    >
      <div
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-expanded={disabled ? false : open}
        className={cn(
          "relative flex min-h-10 w-full cursor-pointer flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background transition-colors",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
        onKeyDown={(e) => {
          if (disabled) {
            return;
          }
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
      >
        {selectedListsPaths && selectedListsPaths.length > 0 ? (
          <>
            {selectedListsPaths.map((path) => {
              const listName = listNameFromPath(path);
              const listId = path.at(-1)?.id;
              return (
                <div
                  key={listId}
                  className="flex min-h-7 space-x-1 rounded bg-accent px-2"
                >
                  <div className="m-auto flex gap-2">
                    {listName}
                    <button
                      type="button"
                      disabled={disabled}
                      className="cursor-pointer rounded-full outline-none ring-offset-background focus:ring-1 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSelection(listId);
                      }}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Remove {listName}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          placeholder
        )}
      </div>
    </ListSelectorComponent>
  );
}
export function BookmarkListSelector(props: BookmarkListSelectorProps) {
  const { data, isPending } = useBookmarkLists();
  const {
    hideSubtreeOf,
    hideBookmarkIds = [],
    listTypes = ["manual", "smart"],
    ...selectorProps
  } = props;
  let { allPaths } = data ?? {};
  allPaths = allPaths?.filter((path) => {
    const lastItem = path[path.length - 1];
    if (hideBookmarkIds.includes(lastItem.id)) {
      return false;
    }
    if (!listTypes.includes(lastItem.type)) {
      return false;
    }
    // Hide lists where user is a viewer (can't add/remove bookmarks)
    if (lastItem.userRole === "viewer") {
      return false;
    }
    if (!hideSubtreeOf) {
      return true;
    }
    return !path.map((p) => p.id).includes(hideSubtreeOf);
  });

  return selectorProps.multiSelect ? (
    <BookmarkListMultiSelector
      {...selectorProps}
      isPending={isPending}
      allPaths={allPaths}
    />
  ) : (
    <BookmarkListSingleSelector
      {...selectorProps}
      isPending={isPending}
      allPaths={allPaths}
    />
  );
}
