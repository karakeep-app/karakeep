import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import { buildApiHeaders } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Linking, View } from "react-native";

import { useTRPC } from "@karakeep/shared-react/trpc";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkLinkImageUrl,
  getBookmarkRefreshInterval,
} from "@karakeep/shared/utils/bookmarkUtils";

import { useToast } from "../ui/Toast";
import BookmarkAssetImage from "./BookmarkAssetImage";
import BookmarkTextMarkdown from "./BookmarkTextMarkdown";
import {
  BookmarkCardContainer,
  BookmarkCardContext,
} from "./card/BookmarkCard";
import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import TagList from "./card/TagList";
import { Divider } from "../ui/Divider";
import ActionBar from "./card/ActionBar";

function useLinkCardContext({
  bookmark,
}: {
  bookmark: ZBookmark;
}): Omit<BookmarkCardContext, "isOwner" | "bookmark"> | undefined {
  const { settings } = useAppSettings();

  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return undefined;
  }

  const url = bookmark.content.url;
  const parsedUrl = new URL(url);

  const imageUrl = getBookmarkLinkImageUrl(bookmark.content);

  let contentComp;
  if (imageUrl) {
    contentComp = (
      <View className="h-56 min-h-56 w-full">
        <Image
          source={
            imageUrl.localAsset
              ? {
                  uri: `${settings.address}${imageUrl.url}`,
                  headers: buildApiHeaders(
                    settings.apiKey,
                    settings.customHeaders,
                  ),
                }
              : {
                  uri: imageUrl.url,
                }
          }
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      </View>
    );
  } else {
    contentComp = (
      <View className="h-56 w-full overflow-hidden rounded-t-lg">
        <Image
          // oxlint-disable-next-line no-require-imports
          source={require("@/assets/blur.jpeg")}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      </View>
    );
  }

  return {
    media: contentComp,
    title: bookmark.title ?? bookmark.content.title ?? parsedUrl.host,
    footerExtras: (
      <Text className="my-auto shrink" numberOfLines={1}>
        {parsedUrl.host}
      </Text>
    ),
  };
}

function useTextCardContext({
  bookmark,
}: {
  bookmark: ZBookmark;
}): Omit<BookmarkCardContext, "isOwner" | "bookmark"> | undefined {
  if (bookmark.content.type !== BookmarkTypes.TEXT) {
    return undefined;
  }
  const content = bookmark.content.text;

  return {
    body: (
      <View className="max-h-56 overflow-hidden p-2 text-foreground">
        <BookmarkTextMarkdown text={content} />
      </View>
    ),
    title: bookmark.title ?? undefined,
  };
}

function useAssetCardContext({
  bookmark,
}: {
  bookmark: ZBookmark;
}): Omit<BookmarkCardContext, "isOwner" | "bookmark"> | undefined {
  if (bookmark.content.type !== BookmarkTypes.ASSET) {
    return undefined;
  }
  const title = bookmark.title ?? bookmark.content.fileName;

  const assetImage =
    bookmark.assets.find((r) => r.assetType == "assetScreenshot")?.id ??
    bookmark.content.assetId;

  return {
    media: (
      <BookmarkAssetImage
        assetId={assetImage}
        className="h-56 min-h-56 w-full"
      />
    ),
    title: title ?? undefined,
  };
}

export default function BookmarkCard({
  bookmark: initialData,
}: {
  bookmark: ZBookmark;
}) {
  const api = useTRPC();
  const { data: bookmark } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId: initialData.id,
      },
      {
        initialData,
        refetchInterval: (query) => {
          const data = query.state.data;
          if (!data) {
            return false;
          }
          return getBookmarkRefreshInterval(data);
        },
      },
    ),
  );

  const router = useRouter();
  const { settings } = useAppSettings();
  const { toast } = useToast();
  const { data: currentUser } = useWhoAmI();

  const onOpenBookmark = (bookmark: ZBookmark) => {
    if (
      bookmark.content.type === BookmarkTypes.LINK &&
      settings.defaultBookmarkView === "externalBrowser"
    ) {
      void Linking.openURL(bookmark.content.url).catch(() => {
        toast({
          message: "Failed to open link",
          variant: "destructive",
          showProgress: false,
        });

        router.push(`/dashboard/bookmarks/${bookmark.id}`);
      });
      return;
    }

    router.push(`/dashboard/bookmarks/${bookmark.id}`);
  };

  const linkContext = useLinkCardContext({ bookmark });
  const textContext = useTextCardContext({ bookmark });
  const assetContext = useAssetCardContext({ bookmark });
  const ctx = linkContext ?? textContext ?? assetContext;

  return (
    <BookmarkCardContainer.Provider
      value={{
        ...ctx,
        isOwner: currentUser?.id === bookmark.userId,
        bookmark,
        mediaOnPress: () => onOpenBookmark(bookmark),
        bodyOnPress: () => onOpenBookmark(bookmark),
        titleOnPress: () => onOpenBookmark(bookmark),
      }}
    >
      <BookmarkCardContainer.Root>
        <View className="flex gap-2">
          <BookmarkCardContainer.Media />
          <View className="flex gap-2 p-2">
            <BookmarkCardContainer.Title />
            <BookmarkCardContainer.Body />
            <BookmarkCardContainer.NoteSection />
            <TagList bookmark={bookmark} />
            <Divider orientation="vertical" className="mt-2 h-0.5 w-full" />
            <View className="mt-2 flex flex-row justify-between px-2 pb-2">
              <BookmarkCardContainer.FooterExtras />
              <ActionBar bookmark={bookmark} />
            </View>
          </View>
        </View>
      </BookmarkCardContainer.Root>
    </BookmarkCardContainer.Provider>
  );
}
