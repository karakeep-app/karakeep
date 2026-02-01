import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";

export default function LeaveListConfirmationDialog({
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
  const api = useTRPC();
  const { t } = useTranslation();
  const currentPath = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { mutate: leaveList, isPending } = useMutation(
    api.lists.leaveList.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("lists.leave_list.success", {
            icon: list.icon,
            name: list.name,
          }),
        });
        setOpen(false);
        // Invalidate the lists cache
        queryClient.invalidateQueries(api.lists.list.pathFilter());
        // If currently viewing this list, redirect to lists page
        if (currentPath.includes(list.id)) {
          router.push("/dashboard/lists");
        }
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          description: error.message || t("common.something_went_wrong"),
        });
      },
    }),
  );

  return (
    <ActionConfirmingDialog
      open={open}
      setOpen={setOpen}
      title={t("lists.leave_list.title")}
      description={
        <div className="space-y-3">
          <p className="text-balance">
            {t("lists.leave_list.confirm_message", {
              icon: list.icon,
              name: list.name,
            })}
          </p>
          <p className="text-balance text-sm text-muted-foreground">
            {t("lists.leave_list.warning")}
          </p>
        </div>
      }
      actionButton={() => (
        <ActionButton
          type="button"
          variant="destructive"
          loading={isPending}
          onClick={() => leaveList({ listId: list.id })}
        >
          {t("lists.leave_list.action")}
        </ActionButton>
      )}
    >
      {children}
    </ActionConfirmingDialog>
  );
}
