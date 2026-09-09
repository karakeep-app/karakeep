import { View } from "react-native";
import PDFHighlighterDom from "@/components/bookmarks/PDFHighlighterDom";
import { useAssetUrl } from "@/lib/hooks";
import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useQuery } from "@tanstack/react-query";

export default function BookmarkPdfView({
  bookmark,
  assetId,
}: {
  bookmark: ZBookmark;
  assetId: string;
}) {
  const api = useTRPC();
  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({ bookmarkId: bookmark.id }),
  );
  const { mutate: createHighlight } = useCreateHighlight();
  const { mutate: updateHighlight } = useUpdateHighlight();
  const { mutate: deleteHighlight } = useDeleteHighlight();
  const assetSource = useAssetUrl(assetId);

  if (bookmark.content.type === BookmarkTypes.UNKNOWN) {
    return null;
  }

  return (
    <View className="flex-1">
      <PDFHighlighterDom
        source={assetSource.uri}
        headers={assetSource.headers}
        highlights={highlights?.highlights ?? []}
        onHighlight={(highlight) =>
          createHighlight({ bookmarkId: bookmark.id, ...highlight })
        }
        onUpdateHighlight={(highlight) =>
          updateHighlight({
            highlightId: highlight.id,
            color: highlight.color,
            note: highlight.note,
          })
        }
        onDeleteHighlight={(highlight) =>
          deleteHighlight({ highlightId: highlight.id })
        }
        dom={{ scrollEnabled: true }}
      />
    </View>
  );
}
