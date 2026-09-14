import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { ChevronsDownUp } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { getBookmarkTitle } from "@karakeep/shared/utils/bookmarkUtils";

export default function RelatedBookmarksBox({
  bookmarkId,
}: {
  bookmarkId: string;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const clientConfig = useClientConfig();

  const { data, isPending } = useQuery({
    ...api.bookmarks.getRelated.queryOptions({ bookmarkId }),
    enabled: clientConfig.smartGroups.enabled,
  });

  if (!clientConfig.smartGroups.enabled) {
    return null;
  }
  if (isPending || !data || data.bookmarks.length === 0) {
    return null;
  }

  return (
    <Collapsible defaultOpen={true}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("preview.related_bookmarks")}
        <ChevronsDownUp className="size-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1.5 py-3">
        {data.bookmarks.map((bookmark) => (
          <Link
            key={bookmark.id}
            href={`/dashboard/preview/${bookmark.id}`}
            className="rounded-md border bg-background p-2 text-sm hover:bg-muted"
          >
            <p className="line-clamp-1 font-medium">
              {getBookmarkTitle(bookmark) ?? "Untitled"}
            </p>
            {bookmark.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {bookmark.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag.id} variant="secondary" className="text-xs">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}
          </Link>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
