"use client";

import { useEffect, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { ButtonWithTooltip } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Toggle } from "@/components/ui/toggle";
import useBulkTagActionsStore from "@/lib/bulkTagActions";
import { useTranslation } from "@/lib/i18n/client";
import { CheckCheck, Pencil, Trash2, X } from "lucide-react";

import { useDeleteTag } from "@karakeep/shared-react/hooks/tags";
import { limitConcurrency } from "@karakeep/shared/concurrency";

const MAX_CONCURRENT_BULK_ACTIONS = 50;

export default function BulkTagAction() {
  const { t } = useTranslation();

  const {
    selectedTagIds,
    isBulkEditEnabled,
    selectAll: selectAllTags,
    unSelectAll: unSelectAllTags,
    isEverythingSelected,
    setIsBulkEditEnabled,
  } = useBulkTagActionsStore();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    return () => {
      setIsBulkEditEnabled(false);
    };
  }, []);

  const onError = () => {
    toast({
      variant: "destructive",
      title: t("common.something_went_wrong"),
      description: "There was a problem with your request.",
    });
  };

  const deleteTagMutator = useDeleteTag({
    onSuccess: () => {
      setIsBulkEditEnabled(false);
    },
    onError,
  });

  const deleteSelectedTags = async () => {
    await Promise.all(
      limitConcurrency(
        selectedTagIds.map(
          (item) => () => deleteTagMutator.mutateAsync({ tagId: item }),
        ),
        MAX_CONCURRENT_BULK_ACTIONS,
      ),
    );
    toast({
      description: `${selectedTagIds.length} tags have been deleted!`,
    });
    setIsDeleteDialogOpen(false);
  };

  const actionList = [
    {
      name: isEverythingSelected()
        ? t("actions.unselect_all")
        : t("actions.select_all"),
      icon: (
        <p className="flex items-center gap-2">
          ( <CheckCheck size={18} /> {selectedTagIds.length} )
        </p>
      ),
      action: () =>
        isEverythingSelected() ? unSelectAllTags() : selectAllTags(),
      alwaysEnable: true,
    },
    {
      name: t("actions.delete"),
      icon: <Trash2 size={18} color="red" />,
      action: () => setIsDeleteDialogOpen(true),
    },
    {
      name: t("actions.close_bulk_edit"),
      icon: <X size={18} />,
      action: () => setIsBulkEditEnabled(false),
      alwaysEnable: true,
    },
  ];

  return (
    <div>
      <ActionConfirmingDialog
        open={isDeleteDialogOpen}
        setOpen={setIsDeleteDialogOpen}
        title={"Delete Tags"}
        description={<p>Are you sure you want to delete these tags?</p>}
        actionButton={() => (
          <ActionButton
            type="button"
            variant="destructive"
            loading={deleteTagMutator.isPending}
            onClick={() => deleteSelectedTags()}
          >
            {t("actions.delete")}
          </ActionButton>
        )}
      />

      {!isBulkEditEnabled ? (
        <Toggle
          variant="outline"
          className="bg-background"
          aria-label="Toggle bulk edit"
          pressed={isBulkEditEnabled}
          onPressedChange={setIsBulkEditEnabled}
        >
          <Pencil className="mr-2 size-4" />
          {t("actions.bulk_edit")}
        </Toggle>
      ) : (
        <div className="flex items-center rounded-md bg-background">
          {actionList.map(({ name, icon, action, alwaysEnable }) => (
            <ButtonWithTooltip
              tooltip={name}
              disabled={!selectedTagIds.length && !alwaysEnable}
              delayDuration={100}
              variant="none"
              key={name}
              onClick={action}
            >
              {icon}
            </ButtonWithTooltip>
          ))}
        </div>
      )}
    </div>
  );
}
