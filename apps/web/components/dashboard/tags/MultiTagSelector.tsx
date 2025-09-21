import React from "react";
import { Separator } from "@/components/ui/separator";
import useBulkTagActionsStore from "@/lib/bulkTagActions";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useTheme } from "next-themes";

export const MultiTagSelector = React.memo(function MultiTagSelector({
  id,
  name,
  count,
}: {
  id: string;
  name: string;
  count: number;
}) {
  const toggleTag = useBulkTagActionsStore((state) => state.toggleTag);
  const { theme } = useTheme();
  const isSelected = useBulkTagActionsStore((state) => state.isTagSelected(id));

  const getIconColor = () => {
    if (theme === "dark") {
      return isSelected ? "black" : "white";
    }
    return isSelected ? "white" : "black";
  };

  const getIconBackgroundColor = () => {
    if (theme === "dark") {
      return isSelected ? "bg-white" : "bg-white bg-opacity-10";
    }
    return isSelected ? "bg-black" : "bg-white";
  };

  const pill = (
    <div className="group relative flex">
      <button
        className={cn(
          "flex gap-2 rounded-md border border-border px-2 py-1",
          isSelected
            ? "bg-black bg-opacity-10"
            : "bg-background text-foreground hover:bg-foreground hover:text-background",
        )}
        data-id={id}
        onClick={() => toggleTag(id)}
      >
        {name} <Separator orientation="vertical" /> {count}
        <div
          className={cn(
            "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-gray-600",
            getIconBackgroundColor(),
          )}
        >
          <Check size={12} color={getIconColor()} />
        </div>
      </button>
    </div>
  );

  return pill;
});
