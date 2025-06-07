import Image from "next/image";
import BookmarkTextHighlighter from "@/components/dashboard/preview/BookmarkTextHighlighter";
import { toast } from "@/components/ui/use-toast";
import { api } from "@/lib/trpc";
import { ScrollArea } from "@radix-ui/react-scroll-area";

import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

export function TextContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.TEXT) {
    throw new Error("Invalid content type");
  }

  const banner = bookmark.assets.find(
    (asset) => asset.assetType == "bannerImage",
  );

  const { data: highlights } = api.highlights.getForBookmark.useQuery({
    bookmarkId: bookmark.id,
  });

  const { mutate: createHighlight } = useCreateHighlight({
    onSuccess: () => {
      toast({
        description: "Highlight has been created!",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Something went wrong",
      });
    },
  });

  const { mutate: updateHighlight } = useUpdateHighlight({
    onSuccess: () => {
      toast({
        description: "Highlight has been updated!",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Something went wrong",
      });
    },
  });

  const { mutate: deleteHighlight } = useDeleteHighlight({
    onSuccess: () => {
      toast({
        description: "Highlight has been deleted!",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Something went wrong",
      });
    },
  });

  return (
    <ScrollArea className="h-full">
      {banner && (
        <div className="relative h-52 min-w-full">
          <Image
            alt="banner"
            src={getAssetUrl(banner.id)}
            width={0}
            height={0}
            layout="fill"
            objectFit="cover"
          />
        </div>
      )}
      <BookmarkTextHighlighter
        markdownContent={bookmark.content.text}
        className="mx-auto"
        highlights={highlights?.highlights ?? []}
        onDeleteHighlight={(h) =>
          deleteHighlight({
            highlightId: h.id,
          })
        }
        onUpdateHighlight={(h) =>
          updateHighlight({
            highlightId: h.id,
            color: h.color,
          })
        }
        onHighlight={(h) =>
          createHighlight({
            startOffset: h.startOffset,
            endOffset: h.endOffset,
            color: h.color,
            bookmarkId: bookmark.id,
            text: h.text,
            note: null,
          })
        }
      />
    </ScrollArea>
  );
}
