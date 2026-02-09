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
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

export function FeedSelector({
  value,
  onChange,
  placeholder = "Select a feed",
  className,
}: {
  className?: string;
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const api = useTRPC();
  const { data, isPending } = useQuery(
    api.feeds.list.queryOptions(undefined, {
      select: (data) => data.feeds,
    }),
  );

  if (isPending) {
    return <LoadingSpinner />;
  }

  return (
    <Select onValueChange={onChange} value={value ?? ""}>
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {data?.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
          {(data ?? []).length == 0 && (
            <SelectItem value="nofeed" disabled>
              You don&apos;t currently have any feeds.
            </SelectItem>
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
