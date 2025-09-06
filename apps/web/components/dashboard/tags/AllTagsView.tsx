"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import InfoTooltip from "@/components/ui/info-tooltip";
import { Toggle } from "@/components/ui/toggle";
import useBulkTagActionsStore from "@/lib/bulkTagActions";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { ArrowDownAZ, Combine, Tag } from "lucide-react";

import type { ZGetTagResponse, ZTagBasic } from "@karakeep/shared/types/tags";

import BulkTagAction from "./BulkTagAction";
import { DeleteAllUnusedTags } from "./DeleteAllUnusedTags";
import DeleteTagConfirmationDialog from "./DeleteTagConfirmationDialog";
import { MultiTagSelector } from "./MultiTagSelector";
import { TagPill } from "./TagPill";

export const tagsToPill = (
  tags: ZGetTagResponse[],
  bulkEditEnabled: boolean,
  draggingEnabled: boolean,
  handleOpenDialog: (tag: ZTagBasic) => void,
) => {
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
  const [draggingEnabled, setDraggingEnabled] = useState(false);
  const [sortByName, setSortByName] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<ZTagBasic | null>(null);

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

  return (
    <div className="flex flex-col gap-4">
      {selectedTag && (
        <DeleteTagConfirmationDialog
          tag={selectedTag}
          open={isDialogOpen}
          setOpen={(isOpen) => {
            if (!isOpen) {
              setSelectedTag(null);
            }
            setIsDialogOpen(isOpen);
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
        <CardContent>
          {tagsToPill(
            humanTags,
            isBulkEditEnabled,
            draggingEnabled,
            handleOpenDialog,
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{t("tags.ai_tags")}</span>
            <Badge variant="secondary">{aiTags.length}</Badge>
          </CardTitle>
          <CardDescription>{t("tags.ai_tags_info")}</CardDescription>
        </CardHeader>
        <CardContent>
          {tagsToPill(
            aiTags,
            isBulkEditEnabled,
            draggingEnabled,
            handleOpenDialog,
          )}
        </CardContent>
      </Card>

      <DeleteAllUnusedTags
        emptyTags={emptyTags}
        isBulkEditEnabled={isBulkEditEnabled}
        draggingEnabled={draggingEnabled}
        handleOpenDialog={handleOpenDialog}
      />
    </div>
  );
}
