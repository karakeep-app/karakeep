import { useTranslation } from "@/lib/i18n/client";
import { toast } from "sonner";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

/**
 * Archives or restores a bookmark and offers to undo it from the toast. The
 * toast outlives the card when archiving removes it from the current page, so
 * the handlers live on the mutation rather than on the mutate() call: those
 * would be dropped once the card unmounts.
 */
export function useArchiveBookmarkWithUndo({
  onDone,
}: { onDone?: () => void } = {}) {
  const { t } = useTranslation();

  const getMessage = (archived: boolean | undefined) =>
    archived ? t("toasts.bookmarks.archived") : t("toasts.bookmarks.restored");

  const onError = (e: { data?: { code?: string } | null; message: string }) => {
    toast.error(
      e.data?.code === "BAD_REQUEST"
        ? e.message
        : t("common.something_went_wrong"),
    );
  };

  const { mutate: undo } = useUpdateBookmark({
    onSuccess: (_res, req) => {
      toast.success(getMessage(req.archived));
    },
    onError,
  });

  const { mutate, isPending } = useUpdateBookmark({
    onSuccess: (_res, req) => {
      toast.success(getMessage(req.archived), {
        action: {
          label: t("actions.undo"),
          onClick: () =>
            undo({ bookmarkId: req.bookmarkId, archived: !req.archived }),
        },
      });
      onDone?.();
    },
    onError,
  });

  return {
    isPending,
    setArchived: (bookmarkId: string, archived: boolean) =>
      mutate({ bookmarkId, archived }),
  };
}
