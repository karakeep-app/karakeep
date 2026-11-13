import { CircleAlert } from "lucide-react";

import { cn } from "../utils/css";

export function ErrorCallout({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm",
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-col gap-0.5">
        {title && <p className="font-medium text-destructive">{title}</p>}
        <div className="break-words text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
