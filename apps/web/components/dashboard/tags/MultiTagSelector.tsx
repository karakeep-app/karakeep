import React from "react";
import useBulkTagActionsStore from "@/lib/bulkTagActions";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

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
  const isSelected = useBulkTagActionsStore((state) => state.isTagSelected(id));

  const pill = (
    <div className="group relative flex">
      <button
        className={cn(
          "inline-flex items-center gap-2 rounded-full border py-1 pl-3 pr-1 text-sm font-medium transition-colors",
          isSelected
            ? "border-primary/40 bg-primary/10 text-foreground dark:border-primary/50 dark:bg-primary/15"
            : "border-border bg-secondary/60 text-foreground hover:border-foreground/15 hover:bg-secondary dark:border-white/[0.06] dark:bg-white/[0.04] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.08]",
        )}
        data-id={id}
        onClick={() => toggleTag(id)}
      >
        {name}
        <span
          className={cn(
            "min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs tabular-nums transition-colors",
            isSelected
              ? "bg-primary/15 text-foreground dark:bg-primary/25"
              : "bg-background text-muted-foreground group-hover:text-foreground dark:bg-white/[0.06]",
          )}
        >
          {count}
        </span>
        <div
          className={cn(
            "absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full border shadow-sm transition-colors",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-transparent group-hover:text-muted-foreground dark:border-white/20 dark:bg-card",
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </div>
      </button>
    </div>
  );

  return pill;
});
