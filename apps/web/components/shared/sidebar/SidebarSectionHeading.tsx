import { cn } from "@/lib/utils";

/** The one style of heading for a group of items in a sidebar. */
export default function SidebarSectionHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("text-xs font-medium text-muted-foreground", className)}>
      {children}
    </h2>
  );
}
