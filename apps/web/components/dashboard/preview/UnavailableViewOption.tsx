import type { LucideIcon } from "lucide-react";
import { SelectItem } from "@/components/ui/select";

/**
 * A view that can't be picked yet, saying why, with the action that makes it
 * available if there is one. That's an option of its own, so that the keyboard
 * can reach it: a select's list only moves between its options.
 */
export default function UnavailableViewOption({
  value,
  icon: Icon,
  label,
  reason,
  action,
}: {
  value: string;
  icon?: LucideIcon;
  label: string;
  reason: string;
  action?: { value: string; label: string };
}) {
  return (
    <div className="flex items-center gap-1">
      <SelectItem
        value={value}
        disabled
        // Full strength, as it's here to be read.
        className="min-w-0 flex-1 pe-2 text-muted-foreground data-[disabled]:opacity-100"
      >
        <div className="flex items-start">
          {Icon && <Icon className="mr-2 mt-0.5 h-4 w-4" />}
          <div>
            <div data-view-label>{label}</div>
            <div data-view-reason className="text-xs">
              {reason}
            </div>
          </div>
        </div>
      </SelectItem>
      {action && (
        <SelectItem
          value={action.value}
          className="w-auto shrink-0 justify-center px-2 text-xs font-medium max-sm:min-h-11"
        >
          <span className="sr-only">{label}: </span>
          {action.label}
        </SelectItem>
      )}
    </div>
  );
}
