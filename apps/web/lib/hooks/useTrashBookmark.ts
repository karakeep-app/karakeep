"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n/client";
import { toast } from "sonner";

import {
  useDeleteBookmark,
  useRestoreBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";

// Moves a bookmark to the trash and offers to undo it from the toast.
export function useTrashBookmark() {
  const { t } = useTranslation();
  const currentPath = usePathname();
  const router = useRouter();

  const onError = () => {
    toast.error(t("common.something_went_wrong"));
  };

  const { mutate: restoreBookmark } = useRestoreBookmark({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.restored"));
    },
    onError,
  });

  return useDeleteBookmark({
    onSuccess: (_res, req) => {
      toast.success(t("toasts.bookmarks.moved_to_trash"), {
        action: {
          label: t("actions.undo"),
          onClick: () => restoreBookmark({ bookmarkId: req.bookmarkId }),
        },
      });
      if (currentPath.includes(req.bookmarkId)) {
        router.push("/dashboard/bookmarks");
      }
    },
    onError,
  });
}
