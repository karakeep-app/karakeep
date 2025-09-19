import { usePathname, useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { toast } from "@/components/ui/use-toast";

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
  const currentPath = usePathname();
  const router = useRouter();

  const { mutate: deleteList, isPending } = useDeleteBookmarkList({
    onSuccess: () => {
      toast({
        description: `List "${list.icon} ${list.name}" is deleted!`,
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
      title={`Delete ${list.icon} ${list.name}?`}
      description={`Are you sure you want to delete ${list.icon} ${list.name}?`}
      actionButton={() => (
        <ActionButton
          type="button"
          variant="destructive"
          loading={isPending}
          onClick={() => deleteList({ listId: list.id })}
        >
          Delete
        </ActionButton>
      )}
    >
      {children}
    </ActionConfirmingDialog>
  );
}
