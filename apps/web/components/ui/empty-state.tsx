import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

import { Button } from "./button";

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg bg-slate-50 p-10 text-center shadow-sm dark:bg-slate-700/50 dark:shadow-md",
        className,
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
        <Icon className="h-8 w-8 text-slate-400 dark:text-slate-300" />
      </div>
      <h3 className="mb-2 text-xl font-medium text-slate-700 dark:text-slate-100">
        {title}
      </h3>
      <p className="mb-6 max-w-md text-slate-500 dark:text-slate-400">
        {description}
      </p>
      {action &&
        (action.href ? (
          <Button asChild variant="secondary">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button variant="secondary" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}
