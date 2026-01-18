import React from "react";
import { ActionButton, ActionButtonProps } from "@/components/ui/action-button";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/trpc";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

interface ArchiveBookmarkButtonProps
  extends Omit<ActionButtonProps, "loading" | "disabled"> {
  bookmarkId: string;
  onDone?: () => void;
}

const ArchiveBookmarkButton = React.forwardRef<
  HTMLButtonElement,
  ArchiveBookmarkButtonProps
>(({ bookmarkId, onDone, ...props }, ref) => {
  const { data } = api.bookmarks.getBookmark.useQuery(
    { bookmarkId },
    {
      select: (data) => ({
        archived: data.archived,
      }),
    },
  );

  const { mutate: updateBookmark, isPending: isArchivingBookmark } =
    useUpdateBookmark({
      onSuccess: () => {
        toast({
          description: "Bookmark has been archived!",
        });
        onDone?.();
      },
      onError: (e) => {
        if (e.data?.code == "BAD_REQUEST") {
          toast({
            variant: "destructive",
            description: e.message,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Something went wrong",
          });
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
