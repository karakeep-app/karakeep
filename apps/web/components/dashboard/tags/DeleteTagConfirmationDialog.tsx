import { usePathname, useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { toast } from "@/components/ui/sonner";

import { useDeleteTag } from "@karakeep/shared-react/hooks/tags";

export default function DeleteTagConfirmationDialog({
  tag,
  open,
  setOpen,
}: {
  tag: { id: string; name: string };
  open?: boolean;
  setOpen?: (v: boolean) => void;
}) {
  const currentPath = usePathname();
  const router = useRouter();
  const { mutate: deleteTag, isPending } = useDeleteTag({
    onSuccess: () => {
      toast({
        description: `Tag "${tag.name}" has been deleted!`,
      });
      if (currentPath.includes(tag.id)) {
        router.push("/dashboard/tags");
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
      title={`Delete ${tag.name}?`}
      description={`Are you sure you want to delete the tag "${tag.name}"?`}
      actionButton={(setDialogOpen) => (
        <ActionButton
          type="button"
          variant="destructive"
          loading={isPending}
          onClick={() =>
            deleteTag(
              { tagId: tag.id },
              { onSuccess: () => setDialogOpen(false) },
            )
          }
        >
          Delete
        </ActionButton>
      )}
    />
  );
}
