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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import InfoTooltip from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import Spinner from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { toast } from "@/components/ui/use-toast";
import useBulkTagActionsStore from "@/lib/bulkTagActions";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { keepPreviousData } from "@tanstack/react-query";
import { ArrowDownAZ, ChevronDown, Combine, Search, Tag } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";

import type { ZGetTagResponse, ZTagBasic } from "@karakeep/shared/types/tags";
import { useDeleteUnusedTags } from "@karakeep/shared-react/hooks/tags";

import BulkTagAction from "./BulkTagAction";
import { CreateTagModal } from "./CreateTagModal";
import DeleteTagConfirmationDialog from "./DeleteTagConfirmationDialog";
import { MultiTagSelector } from "./MultiTagSelector";
import { TagPill } from "./TagPill";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

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
  const [sortBy, setSortBy] = useQueryState<"name" | "usage">(
    "sort",
    parseAsStringEnum(["name", "usage"])
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

  const { data, isFetching, isPending } = api.tags.search.useQuery(
    {
      query: searchQuery,
      sortBy,
    },
    {
      placeholderData: keepPreviousData,
    },
  );

  const visibleTagIds = React.useMemo(
    () => data?.tags.map((tag) => tag.id) ?? [],
    [data?.tags],
  );

  useEffect(() => {
    setVisibleTagIds(visibleTagIds);
    return () => {
      setVisibleTagIds([]);
    };
  }, [setVisibleTagIds, visibleTagIds]);

  const groupTags = React.useMemo(() => {
    return (tags: ZGetTagResponse[]) => {
      const human: ZGetTagResponse[] = [];
      const ai: ZGetTagResponse[] = [];
      const empty: ZGetTagResponse[] = [];

      for (const tag of tags) {
        if (tag.numBookmarks === 0) {
          empty.push(tag);
        } else if ((tag.numBookmarksByAttachedType.human ?? 0) > 0) {
          human.push(tag);
        } else if ((tag.numBookmarksByAttachedType.ai ?? 0) > 0) {
          ai.push(tag);
        }
      }

      return { human, ai, empty };
    };
  }, []);

  const allGroupedTags = React.useMemo(
    () => groupTags(data?.tags ?? []),
    [groupTags, data?.tags.map((t) => t.id)],
  );

  const {
    human: allHumanTags,
    ai: allAiTags,
    empty: allEmptyTags,
  } = allGroupedTags;

  const sortByUsageLabel = t("tags.sort_by_usage", {
    defaultValue: "Sort by Usage",
  });
  const sortByNameLabel = t("tags.sort_by_name");
  const sortMode = sortBy;
  const sortLabel = sortBy == "name" ? sortByNameLabel : sortByUsageLabel;

  const unusedButtonLabel =
    allEmptyTags.length > 0
      ? `Show ${allEmptyTags.length} unused tags`
      : hasActiveSearch
        ? "No unused tags matching your search"
        : "You don't have any unused tags";

  const shouldDisableUnusedButton = allEmptyTags.length === 0;

  const tagsToPill = React.useMemo(
    () =>
      (
        tags: ZGetTagResponse[],
        bulkEditEnabled: boolean,
        {
          emptyMessage,
          searchEmptyMessage,
        }: { emptyMessage: string; searchEmptyMessage: string },
      ) => {
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
          </div>
        );
      },
    [draggingEnabled, handleOpenDialog],
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
                endIcon={
                  (isPending || isFetching) && <Spinner className="h-4 w-4" />
                }
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
                    {sortLabel}
                  </span>
                  <ChevronDown className="ml-2 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuRadioGroup
                  value={sortMode}
                  onValueChange={(value) =>
                    setSortBy(value === "name" ? "name" : "usage")
                  }
                >
                  <DropdownMenuRadioItem value="usage">
                    {sortByUsageLabel}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="name">
                    {sortByNameLabel}
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
        <CardContent>
          {tagsToPill(allHumanTags, isBulkEditEnabled, {
            emptyMessage: "No custom tags yet",
            searchEmptyMessage: "No tags match your search",
          })}
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
        <CardContent>
          {tagsToPill(allAiTags, isBulkEditEnabled, {
            emptyMessage: "No AI tags yet",
            searchEmptyMessage: "No tags match your search",
          })}
        </CardContent>
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
                <Button
                  variant="secondary"
                  disabled={shouldDisableUnusedButton}
                >
                  {unusedButtonLabel}
                </Button>
              </CollapsibleTrigger>
              {allEmptyTags.length > 0 && (
                <DeleteAllUnusedTags numUnusedTags={allEmptyTags.length} />
              )}
            </div>
            <CollapsibleContent>
              {tagsToPill(allEmptyTags, isBulkEditEnabled, {
                emptyMessage: "You don't have any unused tags",
                searchEmptyMessage: "No unused tags match your search",
              })}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  );
}
