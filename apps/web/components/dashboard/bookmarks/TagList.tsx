import Link from "next/link";
import { badgeVariants } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

export default function TagList({
  bookmark,
  loading,
  className,
}: {
  bookmark: ZBookmark;
  loading?: boolean;
  className?: string;
}) {
  const { data: session } = useSession();
  const isOwner = session?.user?.id === bookmark.userId;

  if (loading) {
    return (
      <div className="flex w-full flex-col justify-end space-y-2 p-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }
  return (
    <>
      {bookmark.tags.map((t) => (
        <div key={t.id} className={className}>
          {isOwner ? (
            <Link
              key={t.id}
              className={cn(
                badgeVariants({ variant: "secondary" }),
                "text-nowrap font-light text-gray-700 hover:bg-foreground hover:text-secondary dark:text-gray-400",
              )}
              href={`/dashboard/tags/${t.id}`}
            >
              {t.name}
            </Link>
          ) : (
            <span
              key={t.id}
              className={cn(
                badgeVariants({ variant: "secondary" }),
                "text-nowrap font-light text-gray-700 dark:text-gray-400",
              )}
            >
              {t.name}
            </span>
          )}
        </div>
      ))}
    </>
  );
}
