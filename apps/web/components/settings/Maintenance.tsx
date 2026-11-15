"use client";

import type { ComponentProps } from "react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ListFilter } from "lucide-react";

export function SelectionCheckbox({
  indeterminate,
  insideLabel = false,
  className,
  ...props
}: ComponentProps<"input"> & {
  indeterminate?: boolean;
  /** The surrounding label is already the hit area, and labels can't nest. */
  insideLabel?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  const input = (
    <input
      {...props}
      ref={ref}
      type="checkbox"
      className="size-4 shrink-0 cursor-[inherit] accent-primary disabled:opacity-30"
    />
  );
  if (insideLabel) {
    return input;
  }
  return (
    // The pseudo element is the hit area: 32px, or 44px at phone width.
    <label
      className={cn(
        "relative flex size-4 shrink-0 after:absolute after:-inset-2 after:content-[''] max-sm:after:-inset-3.5",
        props.disabled ? "cursor-default" : "cursor-pointer",
        className,
      )}
    >
      {input}
    </label>
  );
}

export function MaintenanceSearch(props: ComponentProps<typeof Input>) {
  return (
    <div className="min-w-0 flex-1">
      <Input
        {...props}
        type="search"
        variant="filled"
        startIcon={
          <ListFilter
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
        }
      />
    </div>
  );
}

export function MaintenanceError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm"
    >
      <p>{t("common.something_went_wrong")}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t("settings.maintenance.try_again")}
      </Button>
    </div>
  );
}
