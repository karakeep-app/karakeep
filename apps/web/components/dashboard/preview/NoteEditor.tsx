import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { useClientConfig } from "@/lib/clientConfig";
import { cn } from "@/lib/utils";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

export function NoteEditor({
  bookmark,
  disabled,
  className,
}: {
  bookmark: ZBookmark;
  disabled?: boolean;
  className?: string;
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
      className={cn(
        "min-h-[5rem] w-full resize-y overflow-auto rounded-md bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground",
        className,
      )}
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
