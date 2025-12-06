"use client";

import React, { useState } from "react";
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
import LoadingSpinner from "@/components/ui/spinner";
import { toast } from "@/components/ui/use-toast";
import { useTranslation } from "@/lib/i18n/client";
import { Trash2 } from "lucide-react";

import type { ZTagBasic } from "@karakeep/shared/types/tags";
import {
  useDeleteUnusedTags,
  usePaginatedSearchTags,
} from "@karakeep/shared-react/hooks/tags";

import DeleteTagConfirmationDialog from "../tags/DeleteTagConfirmationDialog";
import { TagPill } from "../tags/TagPill";

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
          <Trash2 className="mr-2 size-4" />
          {t("tags.delete_all_unused_tags_button")}
        </ActionButton>
      )}
    >
      <Button variant="destructive" disabled={numUnusedTags == 0}>
        <Trash2 className="mr-2 size-4" />
        {t("tags.delete_all_unused_tags")}
      </Button>
    </ActionConfirmingDialog>
  );
}

interface UnusedTagsProps {
  showAsCard?: boolean;
  showCount?: boolean;
}

export function UnusedTags({
  showAsCard = true,
  showCount = true,
}: UnusedTagsProps) {
  const { t } = useTranslation();
  const [selectedTag, setSelectedTag] = useState<ZTagBasic | null>(null);
  const isDialogOpen = !!selectedTag;

  const {
    data: unusedTagsData,
    isLoading: isUnusedTagsLoading,
    hasNextPage: hasNextPageUnusedTags,
    fetchNextPage: fetchNextPageUnusedTags,
    isFetchingNextPage: isFetchingNextPageUnusedTags,
  } = usePaginatedSearchTags({
    nameContains: "",
    sortBy: "usage",
    attachedBy: "none",
    limit: 50,
  });

  const unusedTags = unusedTagsData?.tags ?? [];
  const numUnusedTags = unusedTags.length;

  const handleOpenDialog = (tag: ZTagBasic) => {
    setSelectedTag(tag);
  };

  const content = (
    <>
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
      {isUnusedTagsLoading && unusedTags.length === 0 ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {unusedTags.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {unusedTags.map((tag) => (
                <TagPill
                  key={tag.id}
                  id={tag.id}
                  name={tag.name}
                  count={showCount ? tag.numBookmarks : 0}
                  isDraggable={false}
                  onOpenDialog={handleOpenDialog}
                  showCount={false}
                />
              ))}
            </div>
          )}
          {unusedTags.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("tags.no_unused_tags")}
            </p>
          )}
          {hasNextPageUnusedTags && (
            <div className="mt-4">
              <ActionButton
                variant="secondary"
                onClick={() => fetchNextPageUnusedTags()}
                loading={isFetchingNextPageUnusedTags}
                ignoreDemoMode
              >
                {t("actions.load_more")}
              </ActionButton>
            </div>
          )}
          {numUnusedTags > 0 && (
            <div className="mt-4">
              <DeleteAllUnusedTags numUnusedTags={numUnusedTags} />
            </div>
          )}
        </>
      )}
    </>
  );
  if (!showAsCard) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>{t("tags.unused_tags")}</span>
          <Badge variant="secondary">{numUnusedTags}</Badge>
        </CardTitle>
        <CardDescription>{t("tags.unused_tags_info")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{content}</CardContent>
    </Card>
  );
}
