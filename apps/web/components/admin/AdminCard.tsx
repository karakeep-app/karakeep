import { cn } from "@/lib/utils";

export function AdminCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-md border bg-background p-4", className)}>
      {children}
    </div>
  );
}
