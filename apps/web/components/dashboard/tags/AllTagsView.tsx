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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import InfoTooltip from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import Spinner from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { toast } from "@/components/ui/use-toast";
import useBulkTagActionsStore from "@/lib/bulkTagActions";
import { useTranslation } from "@/lib/i18n/client";
import { ArrowDownAZ, ChevronDown, Combine, Search, Tag } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";

import type { ZGetTagResponse, ZTagBasic } from "@karakeep/shared/types/tags";
import {
  useDeleteUnusedTags,
  usePaginatedSearchTags,
} from "@karakeep/shared-react/hooks/tags";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";

import BulkTagAction from "./BulkTagAction";
import { CreateTagModal } from "./CreateTagModal";
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

export default function AllTagsView() {
  const { t } = useTranslation();

  const [searchQueryRaw, setSearchQuery] = useQueryState("q", {
    defaultValue: "",
  });
  const searchQuery = useDebounce(searchQueryRaw, 100);
  const [sortBy, setSortBy] = useQueryState<"name" | "usage" | "relevance">(
    "sort",
    parseAsStringEnum(["name", "usage", "relevance"])
      .withOptions({
        clearOnDefault: true,
      })
      .withDefault("usage"),
  );
  const hasActiveSearch = searchQuery.length > 0;
  const [draggingEnabled, setDraggingEnabled] = React.useState(false);

  const [selectedTag, setSelectedTag] = React.useState<ZTagBasic | null>(null);
  const isDialogOpen = !!selectedTag;

  const { setVisibleTagIds, isBulkEditEnabled } = useBulkTagActionsStore();

  const handleOpenDialog = React.useCallback((tag: ZTagBasic) => {
    setSelectedTag(tag);
  }, []);

  function toggleDraggingEnabled(): void {
    setDraggingEnabled(!draggingEnabled);
  }

  const {
    data: allHumanTagsRaw,
    isFetching: isHumanTagsFetching,
    isLoading: isHumanTagsLoading,
    hasNextPage: hasNextPageHumanTags,
    fetchNextPage: fetchNextPageHumanTags,
    isFetchingNextPage: isFetchingNextPageHumanTags,
  } = usePaginatedSearchTags({
    nameContains: searchQuery,
    sortBy,
    attachedBy: "human",
    limit: 50,
  });

  const {
    data: allAiTagsRaw,
    isFetching: isAiTagsFetching,
    isLoading: isAiTagsLoading,
    hasNextPage: hasNextPageAiTags,
    fetchNextPage: fetchNextPageAiTags,
    isFetchingNextPage: isFetchingNextPageAiTags,
  } = usePaginatedSearchTags({
    nameContains: searchQuery,
    sortBy,
    attachedBy: "ai",
    limit: 50,
  });

  const {
    data: allEmptyTagsRaw,
    isFetching: isEmptyTagsFetching,
    isLoading: isEmptyTagsLoading,
    hasNextPage: hasNextPageEmptyTags,
    fetchNextPage: fetchNextPageEmptyTags,
    isFetchingNextPage: isFetchingNextPageEmptyTags,
  } = usePaginatedSearchTags({
    nameContains: searchQuery,
    sortBy,
    attachedBy: "none",
    limit: 50,
  });

  const isFetching =
    isHumanTagsFetching || isAiTagsFetching || isEmptyTagsFetching;

  const { allHumanTags, allAiTags, allEmptyTags } = React.useMemo(() => {
    return {
      allHumanTags: allHumanTagsRaw?.tags ?? [],
      allAiTags: allAiTagsRaw?.tags ?? [],
      allEmptyTags: allEmptyTagsRaw?.tags ?? [],
    };
  }, [allHumanTagsRaw, allAiTagsRaw, allEmptyTagsRaw]);

  useEffect(() => {
    const allTags = [...allHumanTags, ...allAiTags, ...allEmptyTags];
    setVisibleTagIds(allTags.map((tag) => tag.id) ?? []);
    return () => {
      setVisibleTagIds([]);
    };
  }, [allHumanTags, allAiTags, allEmptyTags, setVisibleTagIds]);

  const sortLabels: Record<typeof sortBy, string> = {
    name: t("tags.sort_by_name"),
    usage: t("tags.sort_by_usage"),
    relevance: t("tags.sort_by_relevance"),
  };

  const tagsToPill = React.useMemo(
    () =>
      (
        tags: ZGetTagResponse[],
        bulkEditEnabled: boolean,
        {
          emptyMessage,
          searchEmptyMessage,
        }: { emptyMessage: string; searchEmptyMessage: string },
        isLoading: boolean,
      ) => {
        if (isLoading && tags.length === 0) {
          return (
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 15 }).map((_, index) => (
                <Skeleton key={`tag-skeleton-${index}`} className="h-9 w-24" />
              ))}
            </div>
          );
        }

        if (tags.length === 0) {
          return (
            <div className="py-8 text-center">
              <Tag className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <p className="mb-4 text-gray-500">
                {hasActiveSearch ? searchEmptyMessage : emptyMessage}
              </p>
            </div>
          );
        }

        return (
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
            {isLoading &&
              Array.from({ length: 3 }).map((_, index) => (
                <Skeleton
                  key={`tag-skeleton-loading-${index}`}
                  className="h-9 w-24"
                />
              ))}
          </div>
        );
      },
    [draggingEnabled, handleOpenDialog, hasActiveSearch],
  );
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
          }}
        />
      )}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3">
          <span className="text-2xl">{t("tags.all_tags")}</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <CreateTagModal />
            <BulkTagAction />
            <Toggle
              variant="outline"
              className="bg-background"
              aria-label={t("tags.drag_and_drop_merging")}
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
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex w-full items-center gap-2">
            <div className="flex-1">
              <Input
                type="search"
                value={searchQueryRaw}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("common.search")}
                aria-label={t("common.search")}
                startIcon={<Search className="h-4 w-4 text-muted-foreground" />}
                endIcon={isFetching && <Spinner className="h-4 w-4" />}
                autoComplete="off"
                className="h-10"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-shrink-0 bg-background"
                >
                  <ArrowDownAZ className="mr-2 size-4" />
                  <span className="mr-1 text-sm">
                    {t("actions.sort.title")}
                  </span>
                  <span className="hidden text-sm font-medium sm:inline">
                    {sortLabels[sortBy]}
                  </span>
                  <ChevronDown className="ml-2 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuRadioGroup
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as typeof sortBy)}
                >
                  <DropdownMenuRadioItem value="usage">
                    {sortLabels["usage"]}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="name">
                    {sortLabels["name"]}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="relevance">
                    {sortLabels["relevance"]}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{t("tags.your_tags")}</span>
            <Badge variant="secondary">{allHumanTags.length}</Badge>
          </CardTitle>
          <CardDescription>{t("tags.your_tags_info")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tagsToPill(
            allHumanTags,
            isBulkEditEnabled,
            {
              emptyMessage: t("tags.no_custom_tags"),
              searchEmptyMessage: t("tags.no_tags_match_your_search"),
            },
            isHumanTagsLoading,
          )}
          {hasNextPageHumanTags && (
            <ActionButton
              variant="secondary"
              onClick={() => fetchNextPageHumanTags()}
              loading={isFetchingNextPageHumanTags}
              ignoreDemoMode
            >
              {t("actions.load_more")}
            </ActionButton>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{t("tags.ai_tags")}</span>
            <Badge variant="secondary">{allAiTags.length}</Badge>
          </CardTitle>
          <CardDescription>{t("tags.ai_tags_info")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tagsToPill(
            allAiTags,
            isBulkEditEnabled,
            {
              emptyMessage: t("tags.no_ai_tags"),
              searchEmptyMessage: t("tags.no_tags_match_your_search"),
            },
            isAiTagsLoading,
          )}
          {hasNextPageAiTags && (
            <ActionButton
              variant="secondary"
              onClick={() => fetchNextPageAiTags()}
              loading={isFetchingNextPageAiTags}
              ignoreDemoMode
            >
              {t("actions.load_more")}
            </ActionButton>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{t("tags.unused_tags")}</span>
            <Badge variant="secondary">{allEmptyTags.length}</Badge>
          </CardTitle>
          <CardDescription>{t("tags.unused_tags_info")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tagsToPill(
            allEmptyTags,
            isBulkEditEnabled,
            {
              emptyMessage: t("tags.no_unused_tags"),
              searchEmptyMessage: t("tags.no_unused_tags_match_your_search"),
            },
            isEmptyTagsLoading,
          )}
          {hasNextPageEmptyTags && (
            <ActionButton
              variant="secondary"
              onClick={() => fetchNextPageEmptyTags()}
              loading={isFetchingNextPageEmptyTags}
              ignoreDemoMode
            >
              {t("actions.load_more")}
            </ActionButton>
          )}
          {allEmptyTags.length > 0 && (
            <DeleteAllUnusedTags numUnusedTags={allEmptyTags.length} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
