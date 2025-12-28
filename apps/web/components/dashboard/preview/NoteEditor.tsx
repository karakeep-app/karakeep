import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { useClientConfig } from "@/lib/clientConfig";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

export function NoteEditor({
  bookmark,
  disabled,
}: {
  bookmark: ZBookmark;
  disabled?: boolean;
}) {
  const demoMode = !!useClientConfig().demoMode;

  const updateBookmarkMutator = useUpdateBookmark({
    onSuccess: () => {
      toast({
        description: "The bookmark has been updated!",
      });
    },
    onError: () => {
      toast({
        description: "Something went wrong while saving the note",
        variant: "destructive",
      });
    },
  });

  return (
    <Textarea
      className="h-44 w-full overflow-auto rounded bg-background p-2 text-sm text-gray-400 dark:text-gray-300"
      defaultValue={bookmark.note ?? ""}
      disabled={demoMode || disabled}
      placeholder="Write some notes ..."
      onBlur={(e) => {
        if (e.currentTarget.value == bookmark.note) {
          return;
        }
        updateBookmarkMutator.mutate({
          bookmarkId: bookmark.id,
          note: e.currentTarget.value,
        });
      }}
    />
  );
}
