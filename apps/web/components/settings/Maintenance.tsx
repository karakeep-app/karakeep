"use client";

import type { ComponentProps, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

export function SelectionCheckbox({
  indeterminate,
  className,
  ...props
}: ComponentProps<"input"> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      {...props}
      ref={ref}
      type="checkbox"
      className={cn(
        "size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-30",
        className,
      )}
    />
  );
}

export function MaintenanceSearch(props: ComponentProps<typeof Input>) {
  return (
    <div className="min-w-0 flex-1">
      <Input
        {...props}
        type="search"
        startIcon={
          <Search aria-hidden="true" className="size-4 text-muted-foreground" />
        }
      />
    </div>
  );
}

export function MaintenanceEmpty({
  icon,
  title,
  description,
  onReset,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  onReset?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="rounded-full bg-muted p-4 text-muted-foreground">
        {icon}
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {description && (
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {onReset && (
        <Button variant="outline" size="sm" onClick={onReset}>
          {t("settings.maintenance.clear_filters")}
        </Button>
      )}
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
