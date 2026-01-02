import MarkdownEditor from "@/components/ui/markdown/markdown-editor";
import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import { toast } from "@/components/ui/use-toast";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

export function BookmarkMarkdownComponent({
  children: bookmark,
  readOnly = true,
}: {
  children: {
    id: string;
    content: {
      text: string;
    };
  };
  readOnly?: boolean;
}) {
  const { mutate: updateBookmarkMutator, isPending } = useUpdateBookmark({
    onSuccess: () => {
      toast({
        description: "Note updated!",
      });
    },
    onError: () => {
      toast({ description: "Something went wrong", variant: "destructive" });
    },
  });

  const onSave = (text: string) => {
    updateBookmarkMutator({
      bookmarkId: bookmark.id,
      text,
    });
  };

  return (
    <div className="h-full py-5 flex flex-col min-h-full items-center justify-center">
      {readOnly ? (
        <MarkdownReadonly onSave={onSave}>
          {bookmark.content.text}
        </MarkdownReadonly>
      ) : (
        <MarkdownEditor onSave={onSave} isSaving={isPending}>
          {bookmark.content.text}
        </MarkdownEditor>
      )}
    </div>
  );
}
