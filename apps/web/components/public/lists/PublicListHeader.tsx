import Link from "next/link";
import KarakeepLogo from "@/components/KarakeepIcon";
import { buttonVariants } from "@/components/ui/button";
import { BookmarkIcon, RssIcon } from "lucide-react";

export default function PublicListHeader({
  list,
}: {
  list: {
    id: string;
    name: string;
    description: string | null | undefined;
    icon: string;
    ownerName: string;
    numItems: number;
  };
}) {
  const rssLink = `/api/v1/rss/lists/${list.id}`;
  return (
    <div className="rounded-lg border bg-gradient-to-br from-purple-50/50 via-purple-100/30 to-purple-200/40 p-6 transition-all duration-300  dark:from-purple-950/20 dark:via-purple-900/15 dark:to-purple-800/20">
      <div className="space-y-4">
        <KarakeepLogo height={38} />
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          {/* Header */}
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="text-3xl transition-transform duration-200 hover:scale-110">
              {list.icon}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold leading-tight text-foreground">
                {list.name}
              </h1>
              {list.description && list.description.length > 0 && (
                <p className="mt-2 text-lg leading-relaxed text-muted-foreground">
                  {list.description}
                </p>
              )}
            </div>
          </div>
          {/* Created by */}
          <div className="flex gap-3 md:justify-end">
            <div className="flex aspect-square size-10 flex-col items-center justify-center rounded-full bg-primary font-medium text-primary-foreground transition-all duration-200 hover:scale-105 hover:shadow-md">
              {list.ownerName[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created by</p>
              <p className="font-medium text-foreground">{list.ownerName}</p>
            </div>
          </div>
        </div>
        {/* Options */}
        <div className="flex items-center justify-start gap-1 md:justify-end">
          <div className="flex items-center gap-1 text-xs font-light uppercase text-gray-500 transition-colors duration-200 hover:text-gray-700 dark:hover:text-gray-300">
            <BookmarkIcon
              size={12}
              className="transition-transform duration-200 hover:scale-110"
            />
            <span>{list.numItems} bookmarks</span>
          </div>
          <Link
            href={rssLink}
            target="_blank"
            className={buttonVariants({ variant: "none", size: "icon" })}
          >
            <RssIcon className="size-3 text-gray-500" />
          </Link>
        </div>
      </div>
    </div>
  );
}
