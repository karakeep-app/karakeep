import { usePathname, useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";

import { useDeleteBookmark } from "@karakeep/shared-react/hooks//bookmarks";
import { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getBookmarkDisplayTitle } from "@karakeep/shared/utils/bookmarkUtils";

const MAX_LISTED_TITLES = 3;

/** The same warning as for a single bookmark, and which ones it's about. */
export function BulkDeleteDescription({
  bookmarks,
}: {
  bookmarks: ZBookmark[];
}) {
  const { t } = useTranslation();
  const hidden = bookmarks.length - MAX_LISTED_TITLES;
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>
        {t("dialogs.bookmarks.bulk_delete_named_description", {
          count: bookmarks.length,
        })}
      </p>
      <ul className="space-y-1">
        {bookmarks.slice(0, MAX_LISTED_TITLES).map((bookmark) => (
          <li key={bookmark.id} className="truncate text-foreground">
            {getBookmarkDisplayTitle(bookmark) ?? t("common.untitled")}
          </li>
        ))}
        {hidden > 0 && (
          <li>{t("dialogs.bookmarks.bulk_delete_more", { count: hidden })}</li>
        )}
      </ul>
    </div>
  );
}

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
        description: t("common.something_went_wrong"),
      });
    },
  });

  const displayTitle = getBookmarkDisplayTitle(bookmark);

  return (
    <ActionConfirmingDialog
      open={open}
      setOpen={setOpen}
      title={t("dialogs.bookmarks.delete_confirmation_title")}
      description={
        <p className="line-clamp-3 break-words text-sm text-muted-foreground">
          {displayTitle
            ? t("dialogs.bookmarks.delete_named_description", {
                title: displayTitle,
              })
            : t("dialogs.bookmarks.delete_confirmation_description")}
        </p>
      }
      actionButton={() => (
        <ActionButton
          type="button"
          variant="destructive"
          loading={isPending}
          onClick={() => deleteBoomark({ bookmarkId: bookmark.id })}
        >
          {t("actions.delete")}
        </ActionButton>
      )}
    >
      {children}
    </ActionConfirmingDialog>
  );
}
