"use client";

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
import { toast } from "@/components/ui/sonner";
import LoadingSpinner from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n/client";
import { Trash2 } from "lucide-react";

import {
  useDeleteUnusedTags,
  usePaginatedSearchTags,
} from "@karakeep/shared-react/hooks/tags";

export function UnusedTagsSection() {
  const { t } = useTranslation();

  const { data, isLoading, hasNextPage } = usePaginatedSearchTags({
    attachedBy: "none",
    limit: 50,
  });

  const count = data?.tags.length ?? 0;

  const { mutate, isPending } = useDeleteUnusedTags({
    onSuccess: () => {
      toast({ description: `Deleted all unused tags` });
    },
    onError: () => {
      toast({ description: "Something went wrong", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>{t("tags.unused_tags")}</span>
          <Badge variant="secondary">
            {count}
            {hasNextPage ? "+" : ""}
          </Badge>
        </CardTitle>
        <CardDescription>{t("tags.unused_tags_info")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <ActionConfirmingDialog
            title={t("tags.delete_all_unused_tags")}
            description={`Are you sure you want to delete the ${count} unused tags?`}
            actionButton={() => (
              <ActionButton
                variant="destructive"
                loading={isPending}
                onClick={() => mutate()}
              >
                <Trash2 className="mr-2 size-4" />
                {t("tags.delete_all_unused_tags")}
              </ActionButton>
            )}
          >
            <Button variant="destructive" disabled={count === 0}>
              <Trash2 className="mr-2 size-4" />
              {t("tags.delete_all_unused_tags")}
            </Button>
          </ActionConfirmingDialog>
        )}
      </CardContent>
    </Card>
  );
}
