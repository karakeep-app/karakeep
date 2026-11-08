import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The one statistic pattern for the app: a muted label with an optional neutral
 * icon, one large value, and an optional line of helper text. Pass `href` to make
 * the whole tile a link to the page it counts, or `onClick` to make it a toggle
 * button, `pressed` marks it as the active one. Without either it's static, and
 * doesn't react to the pointer. `action` is a control of its own in the corner,
 * such as a period selector, and takes the place of the icon.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  action,
  helper,
  loading = false,
  href,
  onClick,
  pressed,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  helper?: React.ReactNode;
  loading?: boolean;
  href?: string;
  onClick?: () => void;
  pressed?: boolean;
  className?: string;
}) {
  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2 text-sm text-muted-foreground">
        <span className="min-w-0">{label}</span>
        {action ?? (Icon && <Icon className="mt-0.5 size-4 shrink-0" />)}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </div>
      )}
      {helper && (
        <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
      )}
    </>
  );
  const base = "min-w-0 rounded-lg border bg-card p-4 text-card-foreground";
  const interactive =
    "flex flex-col text-left outline-none transition-colors hover:border-muted-foreground/40 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

  if (href) {
    return (
      <Link
        href={href}
        prefetch={false}
        className={cn(base, interactive, className)}
      >
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        aria-pressed={pressed}
        onClick={onClick}
        className={cn(
          base,
          interactive,
          // Quieter than a focus ring, which has to stay the loudest thing here.
          pressed &&
            "border-muted-foreground/40 bg-muted hover:border-muted-foreground/40 hover:bg-muted",
          className,
        )}
      >
        {content}
      </button>
    );
  }
  return <div className={cn(base, className)}>{content}</div>;
}
