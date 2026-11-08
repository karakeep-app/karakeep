import { useTranslation } from "@/lib/i18n/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  useCreateHighlight,
  useDeleteHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useTRPC } from "@karakeep/shared-react/trpc";

/**
 * Deletes a highlight straight away and offers Undo in the toast. Undo recreates
 * it from the deleted row, so the restored highlight gets a new id and createdAt.
 *
 * The callbacks are registered on the hook rather than on mutate(): the card that
 * triggered the delete unmounts as soon as the list refetches, and react-query
 * drops per-call callbacks once their observer is gone.
 */
export function useDeleteHighlightWithUndo() {
  const { t } = useTranslation();
  const api = useTRPC();
  const queryClient = useQueryClient();
  // The shared hooks don't refresh filtered results on the highlights page.
  const refreshSearch = () =>
    queryClient.invalidateQueries(api.highlights.search.pathFilter());
  const onError = () => {
    toast.error(t("common.something_went_wrong"));
  };

  const { mutate: restoreHighlight } = useCreateHighlight({
    onSuccess: () => {
      refreshSearch();
      toast.success(t("toasts.highlights.restored"));
    },
    onError,
  });

  return useDeleteHighlight({
    onSuccess: (deleted) => {
      refreshSearch();
      toast.success(t("toasts.highlights.deleted"), {
        // A modal dialog turns off pointer events on the body, which the toast
        // would inherit, leaving Undo unclickable inside the preview modal.
        style: { pointerEvents: "auto" },
        action: {
          label: t("actions.undo"),
          onClick: () =>
            restoreHighlight({
              bookmarkId: deleted.bookmarkId,
              startOffset: deleted.startOffset,
              endOffset: deleted.endOffset,
              color: deleted.color,
              text: deleted.text,
              note: deleted.note,
            }),
        },
      });
    },
    onError,
  });
}
