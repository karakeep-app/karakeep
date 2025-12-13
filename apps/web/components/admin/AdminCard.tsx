import { cn } from "@/lib/utils";

export function AdminCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 text-card-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
