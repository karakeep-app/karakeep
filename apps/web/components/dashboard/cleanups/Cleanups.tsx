"use client";

import { useState } from "react";
import useBulkTagActionsStore from "@/lib/bulkTagActions";
import { api } from "@/lib/trpc";
import { Separator } from "@radix-ui/react-select";
import { Paintbrush } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ZGetTagResponse, ZTagBasic } from "@karakeep/shared/types/tags";

import { DeleteAllUnusedTags } from "../tags/DeleteAllUnusedTags";
import DeleteTagConfirmationDialog from "../tags/DeleteTagConfirmationDialog";
import { DuplicateTags } from "./DuplicateTags";

export function Cleanups({ initialData }: { initialData: ZGetTagResponse[] }) {
  const { t } = useTranslation();
  const { isBulkEditEnabled } = useBulkTagActionsStore();
  const { data } = api.tags.list.useQuery(undefined, {
    initialData: { tags: initialData },
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<ZTagBasic | null>(null);

  const handleOpenDialog = (tag: ZTagBasic) => {
    setSelectedTag(tag);
    setIsDialogOpen(true);
  };

  const allTags = data.tags;

  const emptyTags = allTags.filter((t) => t.numBookmarks === 0);

  return (
    <div className="flex flex-col gap-y-4 rounded-md border bg-background p-4">
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
      <span className="flex items-center gap-1 text-2xl">
        <Paintbrush />
        {t("cleanups.cleanups")}
      </span>
      <Separator />
      <DuplicateTags allTags={allTags} />
      <DeleteAllUnusedTags
        emptyTags={emptyTags}
        isBulkEditEnabled={isBulkEditEnabled}
        draggingEnabled={false}
        handleOpenDialog={handleOpenDialog}
      />
    </div>
  );
}
