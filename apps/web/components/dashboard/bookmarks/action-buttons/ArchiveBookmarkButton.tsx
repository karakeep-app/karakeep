import React from "react";
import { ActionButton, ActionButtonProps } from "@/components/ui/action-button";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";

interface ArchiveBookmarkButtonProps extends Omit<
  ActionButtonProps,
  "loading" | "disabled"
> {
  bookmarkId: string;
  onDone?: () => void;
}

const ArchiveBookmarkButton = React.forwardRef<
  HTMLButtonElement,
  ArchiveBookmarkButtonProps
>(({ bookmarkId, onDone, ...props }, ref) => {
  const api = useTRPC();
  const { data } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      { bookmarkId },
      {
        select: (data) => ({
          archived: data.archived,
        }),
      },
    ),
  );

  const { mutate: updateBookmark, isPending: isArchivingBookmark } =
    useUpdateBookmark({
      onSuccess: () => {
        toast.success("Bookmark has been archived!");
        onDone?.();
      },
      onError: (e) => {
        if (e.data?.code == "BAD_REQUEST") {
          toast.error(e.message);
        } else {
          toast.error("Something went wrong");
        }
      },
    });

  if (!data) {
    return <span />;
  }

  return (
    <ActionButton
      ref={ref}
      loading={isArchivingBookmark}
      disabled={data.archived}
      onClick={() =>
        updateBookmark({
          bookmarkId,
          archived: !data.archived,
        })
      }
      {...props}
    />
  );
});

ArchiveBookmarkButton.displayName = "ArchiveBookmarkButton";
export default ArchiveBookmarkButton;
