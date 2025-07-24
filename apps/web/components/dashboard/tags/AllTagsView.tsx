"use client";

import React, { useEffect } from "react";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import InfoTooltip from "@/components/ui/info-tooltip";
import { Toggle } from "@/components/ui/toggle";
import { toast } from "@/components/ui/use-toast";
import useBulkTagActionsStore from "@/lib/bulkTagActions";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { ArrowDownAZ, Combine, Tag } from "lucide-react";

import type { ZGetTagResponse, ZTagBasic } from "@karakeep/shared/types/tags";
import { useDeleteUnusedTags } from "@karakeep/shared-react/hooks/tags";

import BulkTagAction from "./BulkTagAction";
import DeleteTagConfirmationDialog from "./DeleteTagConfirmationDialog";
import { MultiTagSelector } from "./MultiTagSelector";
import { TagPill } from "./TagPill";

function DeleteAllUnusedTags({ numUnusedTags }: { numUnusedTags: number }) {
  const { t } = useTranslation();
  const { mutate, isPending } = useDeleteUnusedTags({
    onSuccess: () => {
      toast({
        description: `Deleted all ${numUnusedTags} unused tags`,
      });
    },
    onError: () => {
      toast({
        description: "Something went wrong",
        variant: "destructive",
      });
    },
  });
  return (
    <ActionConfirmingDialog
      title={t("tags.delete_all_unused_tags")}
      description={`Are you sure you want to delete the ${numUnusedTags} unused tags?`}
      actionButton={() => (
        <ActionButton
          variant="destructive"
          loading={isPending}
          onClick={() => mutate()}
        >
          DELETE THEM ALL
        </ActionButton>
      )}
    >
      <Button variant="destructive" disabled={numUnusedTags == 0}>
        {t("tags.delete_all_unused_tags")}
      </Button>
    </ActionConfirmingDialog>
  );
}

const byUsageSorter = (a: ZGetTagResponse, b: ZGetTagResponse) => {
  // Sort by name if the usage is the same to get a stable result
  if (b.numBookmarks == a.numBookmarks) {
    return byNameSorter(a, b);
  }
  return b.numBookmarks - a.numBookmarks;
};
const byNameSorter = (a: ZGetTagResponse, b: ZGetTagResponse) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export default function AllTagsView({
  initialData,
}: {
  initialData: ZGetTagResponse[];
}) {
  const { t } = useTranslation();
  const [draggingEnabled, setDraggingEnabled] = React.useState(false);
  const [sortByName, setSortByName] = React.useState(false);

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedTag, setSelectedTag] = React.useState<ZTagBasic | null>(null);

  const { setVisibleTagIds, isBulkEditEnabled } = useBulkTagActionsStore();

  const handleOpenDialog = (tag: ZTagBasic) => {
    setSelectedTag(tag);
    setIsDialogOpen(true);
  };

  function toggleSortByName(): void {
    setSortByName(!sortByName);
  }

  function toggleDraggingEnabled(): void {
    setDraggingEnabled(!draggingEnabled);
  }

  const { data } = api.tags.list.useQuery(undefined, {
    initialData: { tags: initialData },
  });

  useEffect(() => {
    const visibleTagIds = data.tags.map((tag) => tag.id);
    setVisibleTagIds(visibleTagIds);
    return () => {
      setVisibleTagIds([]);
    };
  }, [data.tags]);

  // Sort tags by usage desc
  const allTags = data.tags.sort(sortByName ? byNameSorter : byUsageSorter);

  const humanTags = allTags.filter(
    (t) => (t.numBookmarksByAttachedType.human ?? 0) > 0,
  );
  const aiTags = allTags.filter(
    (t) =>
      (t.numBookmarksByAttachedType.human ?? 0) == 0 &&
      (t.numBookmarksByAttachedType.ai ?? 0) > 0,
  );
  const emptyTags = allTags.filter((t) => t.numBookmarks === 0);

  const tagsToPill = (tags: typeof allTags, bulkEditEnabled: boolean) => {
    let tagPill;
    if (tags.length) {
      tagPill = (
        <div className="flex flex-wrap gap-3">
          {tags.map((t) =>
            bulkEditEnabled ? (
              <MultiTagSelector
                key={t.id}
                id={t.id}
                name={t.name}
                count={t.numBookmarks}
              />
            ) : (
              <TagPill
                key={t.id}
                id={t.id}
                name={t.name}
                count={t.numBookmarks}
                isDraggable={draggingEnabled}
                onOpenDialog={handleOpenDialog}
              />
            ),
          )}
        </div>
      );
    } else {
      tagPill = (
        <div className="py-8 text-center">
          <Tag className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <p className="mb-4 text-gray-500">No custom tags yet</p>
        </div>
      );
    }
    return tagPill;
  };
  return (
    <div className="flex flex-col gap-4">
      {selectedTag && (
        <DeleteTagConfirmationDialog
          tag={selectedTag}
          open={isDialogOpen}
          setOpen={(o) => {
            if (!o) {
              setSelectedTag(null);
            }
            setIsDialogOpen(o);
          }}
        />
      )}
      <div className="flex justify-between gap-x-2">
        <span className="text-2xl">{t("tags.all_tags")}</span>
        <div className="flex gap-x-2">
          <BulkTagAction />
          <Toggle
            variant="outline"
            className="bg-background"
            aria-label="Toggle bold"
            pressed={draggingEnabled}
            onPressedChange={toggleDraggingEnabled}
            disabled={isBulkEditEnabled}
          >
            <Combine className="mr-2 size-4" />
            {t("tags.drag_and_drop_merging")}
            <InfoTooltip size={15} className="my-auto ml-2" variant="explain">
              <p>{t("tags.drag_and_drop_merging_info")}</p>
            </InfoTooltip>
          </Toggle>
          <Toggle
            variant="outline"
            className="bg-background"
            aria-label="Toggle bold"
            pressed={sortByName}
            onPressedChange={toggleSortByName}
          >
            <ArrowDownAZ className="mr-2 size-4" /> {t("tags.sort_by_name")}
          </Toggle>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{t("tags.your_tags")}</span>
            <Badge variant="secondary">{humanTags.length}</Badge>
          </CardTitle>
          <CardDescription>{t("tags.your_tags_info")}</CardDescription>
        </CardHeader>
        <CardContent>{tagsToPill(humanTags, isBulkEditEnabled)}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{t("tags.ai_tags")}</span>
            <Badge variant="secondary">{aiTags.length}</Badge>
          </CardTitle>
          <CardDescription>{t("tags.ai_tags_info")}</CardDescription>
        </CardHeader>
        <CardContent>{tagsToPill(aiTags, isBulkEditEnabled)}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("tags.unused_tags")}</CardTitle>
          <CardDescription>{t("tags.unused_tags_info")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Collapsible>
            <div className="space-x-1 pb-2">
              <CollapsibleTrigger asChild>
                <Button variant="secondary" disabled={emptyTags.length == 0}>
                  {emptyTags.length > 0
                    ? `Show ${emptyTags.length} unused tags`
                    : "You don't have any unused tags"}
                </Button>
              </CollapsibleTrigger>
              {emptyTags.length > 0 && (
                <DeleteAllUnusedTags numUnusedTags={emptyTags.length} />
              )}
            </div>
            <CollapsibleContent>
              {tagsToPill(emptyTags, isBulkEditEnabled)}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  );
}
