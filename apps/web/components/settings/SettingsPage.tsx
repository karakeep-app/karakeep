import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

/** Help text under a label, a step below the 14px of the label itself. */
export const settingsHelpClass =
  "text-[13px] leading-[18px] text-muted-foreground";

/**
 * Every settings and admin page has this one width, whatever it holds and
 * whether or not it has data yet, so nothing moves between pages or on the first
 * item. Forms use label-left rows that fill it, tables and statistics fill it.
 * It's centred in the panel, so the margins match on a wide screen.
 */
export function SettingsPage({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // The room at the end is for a save bar and the gap under it, so it can't
    // cover the last section.
    <div className="mx-auto w-full max-w-4xl space-y-5 has-[[data-save-bar]]:pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <PageHeader title={title} description={description} actions={action} />
      {children}
    </div>
  );
}

export function SettingsSection({
  id,
  title,
  count,
  description,
  action,
  children,
}: {
  id?: string;
  title?: string;
  /** How many items the section holds, shown as a pill next to the title. */
  count?: number;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  /** @deprecated No longer styled differently; removed once every page drops it. */
  variant?: "default" | "danger";
}) {
  return (
    <Card id={id}>
      {(title || description || action) && (
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-48 space-y-1">
              {title && (
                <CardTitle className="flex items-center gap-2 text-base">
                  {title}
                  {count !== undefined && (
                    <Badge variant="secondary">{count}</Badge>
                  )}
                </CardTitle>
              )}
              {description && (
                <CardDescription className={settingsHelpClass}>
                  {description}
                </CardDescription>
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        </CardHeader>
      )}
      {children && (
        <CardContent
          className={cn(
            "space-y-4",
            !(title || description || action) && "pt-6",
          )}
        >
          {children}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * One setting: label and description on the left, control on the right, stacked
 * on phones. The label is centred on the control rather than on the row, so an
 * error appearing under the control doesn't move it. `hint` sits right next to the
 * control, such as the "Saved" of an autosaved preference. `inline` is for a
 * control that is only as wide as itself, such as a switch, which stays beside its
 * label on phones too.
 */
export function SettingsRow({
  label,
  description,
  hint,
  inline = false,
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  hint?: React.ReactNode;
  inline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-2 sm:justify-between sm:gap-6",
        inline
          ? "items-center justify-between"
          : "flex-col sm:flex-row sm:items-start",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center justify-between gap-3",
          // The height of a text field or select.
          !inline && "sm:min-h-10",
        )}
      >
        <div className="min-w-0 space-y-1">
          <div className="text-sm font-medium leading-none">{label}</div>
          {description && <p className={settingsHelpClass}>{description}</p>}
        </div>
        {hint}
      </div>
      <div className={cn("shrink-0", !inline && "w-full sm:w-72")}>
        {children}
      </div>
    </div>
  );
}

/** Stacks settings rows with a hairline between them. */
export function SettingsRows({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y [&>*:first-child]:pt-0 [&>*:last-child]:pb-0 [&>*]:py-4">
      {children}
    </div>
  );
}

/** The right-aligned footer of a group of fields with an explicit submit. */
export function SettingsFormFooter({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2">{children}</div>
  );
}
