import { cn } from "@/lib/utils";

/**
 * The one page title pattern for the app. Dashboard, settings and admin pages
 * all use it, so every page opens with the same title size, weight and spacing.
 * The title row has a fixed minimum height and the header aligns to its top, so
 * a description or a taller action can't move the title between pages.
 */
export function PageHeader({
  title,
  description,
  icon,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** The emoji of a user-created list. Other page titles don't get an icon. */
  icon?: React.ReactNode;
  /** Small inline details next to the title, such as an info tooltip. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-2",
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex min-h-10 items-center gap-2">
          {icon && (
            <span className="flex shrink-0 items-center text-2xl leading-none text-muted-foreground [&>svg]:size-5">
              {icon}
            </span>
          )}
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {meta}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex min-h-10 max-w-full flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
