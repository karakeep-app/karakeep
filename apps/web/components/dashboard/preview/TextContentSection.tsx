import { useState } from "react";
import Image from "next/image";
import { BookmarkedTextEditor } from "@/components/dashboard/bookmarks/BookmarkedTextEditor";
import { BookmarkMarkdownComponent } from "@/components/dashboard/bookmarks/BookmarkMarkdownComponent";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n/client";
import { Pencil } from "lucide-react";

import type { ZBookmarkTypeText } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import ArticleTitleBlock from "./ArticleTitleBlock";

export function TextContentSection({
  bookmark,
  readOnly,
}: {
  bookmark: ZBookmark;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const [editorOpen, setEditorOpen] = useState(false);
  if (bookmark.content.type != BookmarkTypes.TEXT) {
    throw new Error("Invalid content type");
  }
  const banner = bookmark.assets.find(
    (asset) => asset.assetType == "bannerImage",
  );

  return (
    <ScrollArea className="h-full">
      {banner && (
        <div className="relative h-52 min-w-full">
          <Image
            alt="banner"
            src={getAssetUrl(banner.id)}
            width={0}
            height={0}
            unoptimized
            layout="fill"
            objectFit="cover"
          />
        </div>
      )}
      <div className="mx-auto max-w-3xl px-4 py-4">
        {/* Without a title of its own, a note just starts with its first line. */}
        {bookmark.title && (
          <ArticleTitleBlock bookmark={bookmark} compactOnPhone />
        )}
        {!readOnly && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="mb-3 text-muted-foreground hover:text-foreground max-sm:h-11 [@media(pointer:coarse)]:h-11"
              onClick={() => setEditorOpen(true)}
            >
              <Pencil className="size-4" />
              {t("preview.edit_note")}
            </Button>
            <BookmarkedTextEditor
              bookmark={bookmark}
              open={editorOpen}
              setOpen={setEditorOpen}
            />
          </>
        )}
        <BookmarkMarkdownComponent>
          {bookmark as ZBookmarkTypeText}
        </BookmarkMarkdownComponent>
      </div>
    </ScrollArea>
  );
}
