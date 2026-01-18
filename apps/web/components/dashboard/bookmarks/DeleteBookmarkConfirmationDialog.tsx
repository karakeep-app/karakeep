import { usePathname, useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";

import { useDeleteBookmark } from "@karakeep/shared-react/hooks//bookmarks";
import { ZBookmark } from "@karakeep/shared/types/bookmarks";

export default function DeleteBookmarkConfirmationDialog({
  bookmark,
  children,
  open,
  setOpen,
}: {
  bookmark: ZBookmark;
  children?: React.ReactNode;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const currentPath = usePathname();
  const router = useRouter();

  const { mutate: deleteBoomark, isPending } = useDeleteBookmark({
    onSuccess: () => {
      toast({
        description: t("toasts.bookmarks.deleted"),
      });
      setOpen(false);
      if (currentPath.includes(bookmark.id)) {
        router.push("/dashboard/bookmarks");
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
      title={t("dialogs.bookmarks.delete_confirmation_title")}
      description={t("dialogs.bookmarks.delete_confirmation_description")}
      actionButton={() => (
        <ActionButton
          type="button"
          variant="destructive"
          loading={isPending}
          onClick={() => deleteBoomark({ bookmarkId: bookmark.id })}
        >
          Delete
        </ActionButton>
      )}
    >
      {children}
    </ActionConfirmingDialog>
  );
}
