import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmarkTags } from "@karakeep/shared-react/hooks/bookmarks";

import { TagsEditor } from "./TagsEditor";

export function BookmarkTagsEditor({
  bookmark,
  disabled,
  placeholder,
  variant,
}: {
  bookmark: ZBookmark;
  disabled?: boolean;
  placeholder?: string;
  variant?: "field" | "inline";
}) {
  const { t } = useTranslation();
  const { mutate } = useUpdateBookmarkTags({
    onError: () => {
      toast({
        variant: "destructive",
        title: t("common.something_went_wrong"),
      });
    },
  });

  const editor = (
    <TagsEditor
      tags={bookmark.tags}
      disabled={disabled}
      placeholder={placeholder}
      variant={variant}
      onAttach={({ tagName, tagId }) => {
        mutate({
          bookmarkId: bookmark.id,
          attach: [
            {
              tagName,
              tagId,
            },
          ],
          detach: [],
        });
      }}
      onDetach={({ tagId }) => {
        mutate({
          bookmarkId: bookmark.id,
          attach: [],
          detach: [{ tagId }],
        });
      }}
    />
  );

  // The inline chips sit beside list chips and the cards' tags, which are pills.
  return variant === "inline" ? (
    <div className="[&_.rounded]:rounded-full">{editor}</div>
  ) : (
    editor
  );
}
