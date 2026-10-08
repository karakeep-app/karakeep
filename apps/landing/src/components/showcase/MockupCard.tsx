import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Card shell shared by the hand-built showcase mockups: rounded, hairline
 * border, and a layered violet-tinted shadow.
 */
export function MockupCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-neutral-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-16px_rgba(124,58,237,0.16),0_16px_40px_-12px_rgba(15,23,42,0.14)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TrafficDots({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="size-2.5 rounded-full bg-red-400" />
      <div className="size-2.5 rounded-full bg-amber-400" />
      <div className="size-2.5 rounded-full bg-green-400" />
    </div>
  );
}
