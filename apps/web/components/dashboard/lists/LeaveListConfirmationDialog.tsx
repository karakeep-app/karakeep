import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { toast } from "@/components/ui/use-toast";
import { api } from "@/lib/trpc";

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
  const currentPath = usePathname();
  const router = useRouter();
  const utils = api.useUtils();

  const { mutate: leaveList, isPending } = api.lists.leaveList.useMutation({
    onSuccess: () => {
      toast({
        description: `You have left "${list.icon} ${list.name}"`,
      });
      setOpen(false);
      // Invalidate the lists cache
      utils.lists.list.invalidate();
      // If currently viewing this list, redirect to lists page
      if (currentPath.includes(list.id)) {
        router.push("/dashboard/lists");
      }
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        description: error.message || "Something went wrong",
      });
    },
  });

  return (
    <ActionConfirmingDialog
      open={open}
      setOpen={setOpen}
      title="Leave List"
      description={
        <div className="space-y-3">
          <p className="text-balance">
            Are you sure you want to leave {list.icon} {list.name}?
          </p>
          <p className="text-balance text-sm text-muted-foreground">
            You will no longer be able to view or access bookmarks in this list.
            The list owner can add you back if needed.
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
          Leave List
        </ActionButton>
      )}
    >
      {children}
    </ActionConfirmingDialog>
  );
}
