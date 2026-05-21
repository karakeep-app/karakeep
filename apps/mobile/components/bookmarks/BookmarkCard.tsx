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

  const compactMedia = (
    <View className="h-28 w-24 overflow-hidden rounded-lg bg-muted">
      <Image
        source={
          imageUrl
            ? imageUrl.localAsset
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
            : // oxlint-disable-next-line no-require-imports
              require("@/assets/blur.jpeg")
        }
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
      />
    </View>
  );

  return {
    media: contentComp,
    compactMedia,
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
    compactBody: (
      <Text className="text-sm leading-5 text-foreground" numberOfLines={3}>
        {content}
      </Text>
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
    compactMedia: (
      <BookmarkAssetImage
        assetId={assetImage}
        className="h-28 w-24 overflow-hidden rounded-lg bg-muted"
      />
    ),
    title: title ?? undefined,
  };
}

function CardLayout({ ctx }: { ctx: BookmarkCardContext }) {
  return (
    <BookmarkCardContainer.Provider value={ctx}>
      <BookmarkCardContainer.Root>
        <View className="flex gap-2">
          <BookmarkCardContainer.Media />
          <View className="flex gap-2 p-2">
            <BookmarkCardContainer.Title />
            <BookmarkCardContainer.Body />
            <BookmarkCardContainer.NoteSection />
            <TagList bookmark={ctx.bookmark} />
            <Divider orientation="vertical" className="mt-2 h-0.5 w-full" />
            <View className="mt-2 flex flex-row justify-between px-2 pb-2">
              <BookmarkCardContainer.FooterExtras />
              <ActionBar bookmark={ctx.bookmark} />
            </View>
          </View>
        </View>
      </BookmarkCardContainer.Root>
    </BookmarkCardContainer.Provider>
  );
}

function ListLayout({ ctx }: { ctx: BookmarkCardContext }) {
  const hasCompactMedia = Boolean(ctx.compactMedia ?? ctx.media);

  return (
    <BookmarkCardContainer.Provider value={ctx}>
      <BookmarkCardContainer.Root>
        <View className={hasCompactMedia ? "flex-row p-3" : "flex gap-2 p-3"}>
          {hasCompactMedia && (
            <View className="justify-start">
              <BookmarkCardContainer.CompactMedia />
            </View>
          )}
          <View
            className={
              hasCompactMedia
                ? "ml-3 min-h-28 flex-1 gap-1.5 overflow-hidden"
                : "gap-2"
            }
          >
            <View className="flex-row items-start gap-2">
              <View className="min-w-0 flex-1 gap-0.5">
                {ctx.title && (
                  <Text
                    className="text-base font-semibold leading-5 text-foreground"
                    numberOfLines={2}
                    onPress={ctx.titleOnPress}
                  >
                    {ctx.title}
                  </Text>
                )}
                <BookmarkCardContainer.FooterExtras />
              </View>
            </View>
            <BookmarkCardContainer.CompactBody />
            <BookmarkCardContainer.NoteSection />
            {ctx.bookmark.tags.length > 0 && (
              <View className="h-7 overflow-hidden">
                <TagList bookmark={ctx.bookmark} />
              </View>
            )}
            <View className="flex-row justify-end pt-0.5">
              <ActionBar bookmark={ctx.bookmark} compact />
            </View>
          </View>
        </View>
      </BookmarkCardContainer.Root>
    </BookmarkCardContainer.Provider>
  );
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
  const Layout = settings.bookmarkLayout === "list" ? ListLayout : CardLayout;

  return (
    <Layout
      ctx={{
        ...ctx,
        isOwner: currentUser?.id === bookmark.userId,
        bookmark,
        mediaOnPress: () => onOpenBookmark(bookmark),
        bodyOnPress: () => onOpenBookmark(bookmark),
        titleOnPress: () => onOpenBookmark(bookmark),
      }}
    />
  );
}
