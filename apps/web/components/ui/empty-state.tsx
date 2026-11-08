import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one empty-state pattern for the app: an icon, a short title, one
 * sentence on what belongs here, and optionally the action that fills it. An
 * empty page gets the dashed box and the large icon, an empty section inside a
 * card gets the compact, borderless version with the small icon.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  inCard = false,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Same as `inCard`, for an empty section rather than an empty page. */
  compact?: boolean;
  /** Compact and without the dashed box, since a card already draws one. */
  inCard?: boolean;
  className?: string;
}) {
  const inSection = compact || inCard;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        inSection
          ? "gap-1 px-4 py-6"
          : "gap-2 rounded-lg border border-dashed border-input/50 px-6 py-12",
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full border bg-background text-muted-foreground",
            inSection ? "mb-1 size-8" : "mb-2 size-11",
          )}
        >
          <Icon className={inSection ? "size-4" : "size-5"} />
        </div>
      )}
      <p className="text-balance text-sm font-medium text-foreground">
        {title}
      </p>
      {description && (
        <p className="max-w-md text-balance text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
