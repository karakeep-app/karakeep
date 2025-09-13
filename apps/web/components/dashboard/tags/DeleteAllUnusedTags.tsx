"use client";

import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
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
import { toast } from "@/components/ui/use-toast";
import { useTranslation } from "@/lib/i18n/client";

import type { ZGetTagResponse, ZTagBasic } from "@karakeep/shared/types/tags";
import { useDeleteUnusedTags } from "@karakeep/shared-react/hooks/tags";

import { tagsToPill } from "./AllTagsView";

export const DeleteAllUnusedTags = ({
  emptyTags,
  isBulkEditEnabled,
  draggingEnabled,
  handleOpenDialog,
}: {
  emptyTags: ZGetTagResponse[];
  isBulkEditEnabled: boolean;
  draggingEnabled: boolean;
  handleOpenDialog: (tag: ZTagBasic) => void;
}) => {
  const { t } = useTranslation();
  const { mutate, isPending } = useDeleteUnusedTags({
    onSuccess: () => {
      toast({
        description: `Deleted all ${emptyTags.length} unused tags`,
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
              <ActionConfirmingDialog
                title={t("tags.delete_all_unused_tags")}
                description={`Are you sure you want to delete the ${emptyTags.length} unused tags?`}
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
                <Button variant="destructive" disabled={emptyTags.length == 0}>
                  {t("tags.delete_all_unused_tags")}
                </Button>
              </ActionConfirmingDialog>
            )}
          </div>
          <CollapsibleContent>
            {tagsToPill(
              emptyTags,
              isBulkEditEnabled,
              draggingEnabled,
              handleOpenDialog,
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};
