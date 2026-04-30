"use client";

import { useRouter } from "next/navigation";
import { TagOptions } from "@/components/dashboard/tags/TagOptions";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Bot, Hash, MoreHorizontal, User } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZGetTagResponse } from "@karakeep/shared/types/tags";

export default function TagHeader({
  initialData,
}: {
  initialData: ZGetTagResponse;
}) {
  const api = useTRPC();
  const router = useRouter();
  const { data: tag, error } = useQuery(
    api.tags.get.queryOptions({ tagId: initialData.id }, { initialData }),
  );

  if (error?.data?.code === "NOT_FOUND") {
    router.push("/dashboard/tags");
  }

  const aiCount = tag.numBookmarksByAttachedType.ai ?? 0;
  const humanCount = tag.numBookmarksByAttachedType.human ?? 0;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Hash className="size-8" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold leading-tight">
            {tag.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{tag.numBookmarks} items</span>
            {humanCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-1">
                  <User className="size-3.5" />
                  {humanCount} by you
                </span>
              </>
            )}
            {aiCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-1">
                  <Bot className="size-3.5" />
                  {aiCount} by AI
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        <TagOptions tag={tag}>
          <Button variant="ghost">
            <MoreHorizontal />
          </Button>
        </TagOptions>
      </div>
    </div>
  );
}
