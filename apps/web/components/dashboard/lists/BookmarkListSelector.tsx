import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LoadingSpinner from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { ZBookmarkList } from "@karakeep/shared/types/lists";

export function BookmarkListSelector({
  value,
  onChange,
  hideSubtreeOf,
  hideBookmarkIds = [],
  placeholder = "Select a list",
  className,
  listTypes = ["manual", "smart"],
}: {
  className?: string;
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  hideSubtreeOf?: string;
  hideBookmarkIds?: string[];
  listTypes?: ZBookmarkList["type"][];
}) {
  const { data, isPending: isFetchingListsPending } = useBookmarkLists();
  let { allPaths } = data ?? {};

  if (isFetchingListsPending) {
    return <LoadingSpinner />;
  }

  allPaths = allPaths?.filter((path) => {
    if (hideBookmarkIds.includes(path[path.length - 1].id)) {
      return false;
    }
    if (!listTypes.includes(path[path.length - 1].type)) {
      return false;
    }
    if (!hideSubtreeOf) {
      return true;
    }
    return !path.map((p) => p.id).includes(hideSubtreeOf);
  });

  return (
    <Select onValueChange={onChange} value={value ?? ""}>
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {allPaths?.map((path) => {
            const l = path[path.length - 1];
            const name = path.map((p) => `${p.icon} ${p.name}`).join(" / ");
            return (
              <SelectItem key={l.id} value={l.id}>
                {name}
              </SelectItem>
            );
          })}
          {allPaths && allPaths.length == 0 && (
            <SelectItem value="nolist" disabled>
              You don&apos;t currently have any lists.
            </SelectItem>
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
