import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { useTranslation } from "@/lib/i18n/client";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import { useDeleteBookmarkList } from "@karakeep/shared-react/hooks/lists";

export default function DeleteListConfirmationDialog({
  list,
  children,
  open,
  setOpen,
}: {
  list: ZBookmarkList;
  children?: React.ReactNode;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const currentPath = usePathname();
  const router = useRouter();
  const [deleteChildren, setDeleteChildren] = React.useState(false);

  const { mutate: deleteList, isPending } = useDeleteBookmarkList({
    onSuccess: () => {
      toast({
        description: `List "${list.icon} ${list.name}" ${deleteChildren ? "and all its children are " : "is "} deleted!`,
      });
      setOpen(false);
      if (currentPath.includes(list.id)) {
        router.push("/dashboard/lists");
      }
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: `Something went wrong`,
      });
    },
  });

  return (
    <ActionConfirmingDialog
      open={open}
      setOpen={setOpen}
      title={t("lists.delete_list.title")}
      description={
        <div className="space-y-3">
          <p className="text-balance">
            Are you sure you want to delete {list.icon} {list.name}?
          </p>
          <p className="text-balance text-sm text-muted-foreground">
            {t("lists.delete_list.description")}
          </p>

          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/50 p-4">
            <div className="space-y-1">
              <Label
                htmlFor="delete-children"
                className="cursor-pointer text-sm font-medium"
              >
                {t("lists.delete_list.delete_children")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("lists.delete_list.delete_children_description")}
              </p>
            </div>
            <Switch
              id="delete-children"
              checked={deleteChildren}
              onCheckedChange={setDeleteChildren}
            />
          </div>
        </div>
      }
      actionButton={() => (
        <ActionButton
          type="button"
          variant="destructive"
          loading={isPending}
          onClick={() => deleteList({ listId: list.id, deleteChildren })}
        >
          {t("actions.delete")}
        </ActionButton>
      )}
    >
      {children}
    </ActionConfirmingDialog>
  );
}
