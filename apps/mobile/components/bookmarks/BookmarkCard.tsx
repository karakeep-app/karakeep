import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { router, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import { api } from "@/lib/trpc";
import { MenuView } from "@react-native-menu/menu";
import { Ellipsis, ShareIcon, Star } from "lucide-react-native";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  useDeleteBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkLinkImageUrl,
  getBookmarkRefreshInterval,
  isBookmarkStillTagging,
} from "@karakeep/shared/utils/bookmarkUtils";

import { Divider } from "../ui/Divider";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import BookmarkAssetImage from "./BookmarkAssetImage";
import BookmarkTextMarkdown from "./BookmarkTextMarkdown";
import { NotePreview } from "./NotePreview";
import TagPill from "./TagPill";

function ActionBar({ bookmark }: { bookmark: ZBookmark }) {
  const { toast } = useToast();
  const { settings } = useAppSettings();

  const onError = () => {
    toast({
      message: "Something went wrong",
      variant: "destructive",
      showProgress: false,
    });
  };

  const { mutate: deleteBookmark, isPending: isDeletionPending } =
    useDeleteBookmark({
      onSuccess: () => {
        toast({
          message: "The bookmark has been deleted!",
          showProgress: false,
        });
      },
      onError,
    });

  const { mutate: favouriteBookmark, variables } = useUpdateBookmark({
    onError,
  });

  const { mutate: archiveBookmark, isPending: isArchivePending } =
    useUpdateBookmark({
      onSuccess: (resp) => {
        toast({
          message: `The bookmark has been ${resp.archived ? "archived" : "un-archived"}!`,
          showProgress: false,
        });
      },
      onError,
    });

  const deleteBookmarkAlert = () =>
    Alert.alert(
      "Delete bookmark?",
      "Are you sure you want to delete this bookmark?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: () => deleteBookmark({ bookmarkId: bookmark.id }),
          style: "destructive",
        },
      ],
    );

  const handleShare = async () => {
    try {
      switch (bookmark.content.type) {
        case BookmarkTypes.LINK:
          await Share.share({
            url: bookmark.content.url,
            message: bookmark.content.url,
          });
          break;

        case BookmarkTypes.TEXT:
          await Clipboard.setStringAsync(bookmark.content.text);
          toast({
            message: "Text copied to clipboard",
            showProgress: false,
          });
          break;

        case BookmarkTypes.ASSET:
          if (bookmark.content.assetType === "image") {
            if (await Sharing.isAvailableAsync()) {
              const assetUrl = `${settings.address}/api/assets/${bookmark.content.assetId}`;
              const fileUri = `${FileSystem.documentDirectory}temp_image.jpg`;

              const downloadResult = await FileSystem.downloadAsync(
                assetUrl,
                fileUri,
                {
                  headers: {
                    Authorization: `Bearer ${settings.apiKey}`,
                  },
                },
              );

              if (downloadResult.status === 200) {
                await Sharing.shareAsync(downloadResult.uri);
                // Clean up the temporary file
                await FileSystem.deleteAsync(downloadResult.uri, {
                  idempotent: true,
                });
              } else {
                throw new Error("Failed to download image");
              }
            }
          } else {
            // For PDFs, share the URL
            const assetUrl = `${settings.address}/api/assets/${bookmark.content.assetId}`;
            await Share.share({
              url: assetUrl,
              message:
                bookmark.title || bookmark.content.fileName || "PDF Document",
            });
          }
          break;
      }
    } catch (error) {
      console.error("Share error:", error);
      toast({
        message: "Failed to share",
        variant: "destructive",
        showProgress: false,
      });
    }
  };

  return (
    <View className="flex flex-row gap-4">
      {(isArchivePending || isDeletionPending) && <ActivityIndicator />}
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          favouriteBookmark({
            bookmarkId: bookmark.id,
            favourited: !bookmark.favourited,
          });
        }}
      >
        {(variables ? variables.favourited : bookmark.favourited) ? (
          <Star fill="#ebb434" color="#ebb434" />
        ) : (
          <Star color="gray" />
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          handleShare();
        }}
      >
        <ShareIcon color="gray" />
      </Pressable>

      <MenuView
        onPressAction={({ nativeEvent }) => {
          Haptics.selectionAsync();
          if (nativeEvent.event === "delete") {
            deleteBookmarkAlert();
          } else if (nativeEvent.event === "archive") {
            archiveBookmark({
              bookmarkId: bookmark.id,
              archived: !bookmark.archived,
            });
          } else if (nativeEvent.event === "manage_list") {
            router.push(`/dashboard/bookmarks/${bookmark.id}/manage_lists`);
          } else if (nativeEvent.event === "manage_tags") {
            router.push(`/dashboard/bookmarks/${bookmark.id}/manage_tags`);
          } else if (nativeEvent.event === "edit") {
            router.push(`/dashboard/bookmarks/${bookmark.id}/info`);
          }
        }}
        actions={[
          {
            id: "edit",
            title: "Edit",
            image: Platform.select({
              ios: "pencil",
            }),
          },
          {
            id: "manage_list",
            title: "Manage Lists",
            image: Platform.select({
              ios: "list.bullet",
            }),
          },
          {
            id: "manage_tags",
            title: "Manage Tags",
            image: Platform.select({
              ios: "tag",
            }),
          },
          {
            id: "archive",
            title: bookmark.archived ? "Un-archive" : "Archive",
            image: Platform.select({
              ios: "folder",
            }),
          },
          {
            id: "delete",
            title: "Delete",
            attributes: {
              destructive: true,
            },
            image: Platform.select({
              ios: "trash",
            }),
          },
        ]}
        shouldOpenOnLongPress={false}
      >
        <Ellipsis onPress={() => Haptics.selectionAsync()} color="gray" />
      </MenuView>
    </View>
  );
}

function TagList({ bookmark }: { bookmark: ZBookmark }) {
  const tags = bookmark.tags;

  if (isBookmarkStillTagging(bookmark)) {
    return (
      <>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="flex flex-row gap-2">
        {tags.map((t) => (
          <TagPill key={t.id} tag={t} />
        ))}
      </View>
    </ScrollView>
  );
}

function LinkCard({
  bookmark,
  onOpenBookmark,
  layout = "card",
}: {
  bookmark: ZBookmark;
  onOpenBookmark: () => void;
  layout?: "card" | "list";
}) {
  const { settings } = useAppSettings();
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  const note = settings.showNotes ? bookmark.note?.trim() : undefined;
  const url = bookmark.content.url;
  const parsedUrl = new URL(url);

  const imageUrl = getBookmarkLinkImageUrl(bookmark.content);

  let imageComp;
  if (imageUrl) {
    imageComp = (
      <Image
        source={
          imageUrl.localAsset
            ? {
                uri: `${settings.address}${imageUrl.url}`,
                headers: {
                  Authorization: `Bearer ${settings.apiKey}`,
                },
              }
            : {
                uri: imageUrl.url,
              }
        }
        className={layout === "list" ? "h-32 w-32 rounded-lg object-cover" : "h-56 min-h-56 w-full object-cover"}
      />
    );
  } else {
    imageComp = (
      <Image
        // oxlint-disable-next-line no-require-imports
        source={require("@/assets/blur.jpeg")}
        className={layout === "list" ? "h-32 w-32 rounded-lg" : "h-56 w-full rounded-t-lg"}
      />
    );
  }

  if (layout === "list") {
    return (
      <Pressable onPress={onOpenBookmark}>
        <View className="flex max-h-40 flex-row gap-3 p-2">
          <View className="shrink-0">
            {imageComp}
          </View>
          <View className="flex flex-1 gap-1.5">
            <Text className="line-clamp-2 text-base font-semibold text-foreground">
              {bookmark.title ?? bookmark.content.title ?? parsedUrl.host}
            </Text>
            <Text className="line-clamp-1 text-xs text-muted-foreground">
              {parsedUrl.host}
            </Text>
            {note && (
              <Text className="line-clamp-1 text-xs text-muted-foreground" numberOfLines={1}>
                {note}
              </Text>
            )}
            {bookmark.tags.length > 0 && (
              <Text className="line-clamp-1 text-xs text-muted-foreground" numberOfLines={1}>
                {bookmark.tags.slice(0, 3).map((t) => t.name).join(" • ")}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View className="flex gap-2">
      <Pressable onPress={onOpenBookmark}>{imageComp}</Pressable>
      <View className="flex gap-2 p-2">
        <Text
          className="line-clamp-2 text-xl font-bold text-foreground"
          onPress={onOpenBookmark}
        >
          {bookmark.title ?? bookmark.content.title ?? parsedUrl.host}
        </Text>
        {note && <NotePreview note={note} bookmarkId={bookmark.id} />}
        <TagList bookmark={bookmark} />
        <Divider orientation="vertical" className="mt-2 h-0.5 w-full" />
        <View className="mt-2 flex flex-row justify-between px-2 pb-2">
          <Text className="my-auto line-clamp-1">{parsedUrl.host}</Text>
          <ActionBar bookmark={bookmark} />
        </View>
      </View>
    </View>
  );
}

function TextCard({
  bookmark,
  onOpenBookmark,
  layout = "card",
}: {
  bookmark: ZBookmark;
  onOpenBookmark: () => void;
  layout?: "card" | "list";
}) {
  const { settings } = useAppSettings();
  if (bookmark.content.type !== BookmarkTypes.TEXT) {
    throw new Error("Wrong content type rendered");
  }
  const note = settings.showNotes ? bookmark.note?.trim() : undefined;
  const content = bookmark.content.text;

  if (layout === "list") {
    return (
      <Pressable onPress={onOpenBookmark}>
        <View className="flex max-h-40 flex-row gap-3 p-2">
          <View className="flex h-32 w-32 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Text className="text-4xl">📝</Text>
          </View>
          <View className="flex flex-1 gap-1.5">
            {bookmark.title && (
              <Text className="line-clamp-2 text-base font-semibold text-foreground">
                {bookmark.title}
              </Text>
            )}
            <Text className="line-clamp-2 text-xs text-muted-foreground" numberOfLines={2}>
              {content}
            </Text>
            {note && (
              <Text className="line-clamp-1 text-xs text-muted-foreground" numberOfLines={1}>
                {note}
              </Text>
            )}
            {bookmark.tags.length > 0 && (
              <Text className="line-clamp-1 text-xs text-muted-foreground" numberOfLines={1}>
                {bookmark.tags.slice(0, 3).map((t) => t.name).join(" • ")}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View className="flex max-h-96 gap-2 p-2">
      <Pressable onPress={onOpenBookmark}>
        {bookmark.title && (
          <Text className="line-clamp-2 text-xl font-bold">
            {bookmark.title}
          </Text>
        )}
      </Pressable>
      <View className="max-h-56 overflow-hidden p-2 text-foreground">
        <Pressable onPress={onOpenBookmark}>
          <BookmarkTextMarkdown text={content} />
        </Pressable>
      </View>
      {note && <NotePreview note={note} bookmarkId={bookmark.id} />}
      <TagList bookmark={bookmark} />
      <Divider orientation="vertical" className="mt-2 h-0.5 w-full" />
      <View className="flex flex-row justify-between p-2">
        <View />
        <ActionBar bookmark={bookmark} />
      </View>
    </View>
  );
}

function AssetCard({
  bookmark,
  onOpenBookmark,
  layout = "card",
}: {
  bookmark: ZBookmark;
  onOpenBookmark: () => void;
  layout?: "card" | "list";
}) {
  const { settings } = useAppSettings();
  if (bookmark.content.type !== BookmarkTypes.ASSET) {
    throw new Error("Wrong content type rendered");
  }
  const note = settings.showNotes ? bookmark.note?.trim() : undefined;
  const title = bookmark.title ?? bookmark.content.fileName;

  const assetImage =
    bookmark.assets.find((r) => r.assetType == "assetScreenshot")?.id ??
    bookmark.content.assetId;

  if (layout === "list") {
    return (
      <Pressable onPress={onOpenBookmark}>
        <View className="flex max-h-40 flex-row gap-3 p-2">
          <View className="shrink-0">
            <BookmarkAssetImage
              assetId={assetImage}
              className="h-32 w-32 rounded-lg object-cover"
            />
          </View>
          <View className="flex flex-1 gap-1.5">
            {title && (
              <Text className="line-clamp-2 text-base font-semibold text-foreground">
                {title}
              </Text>
            )}
            <Text className="line-clamp-1 text-xs text-muted-foreground">
              {bookmark.content.assetType === "image" ? "Image" : "PDF Document"}
            </Text>
            {note && (
              <Text className="line-clamp-1 text-xs text-muted-foreground" numberOfLines={1}>
                {note}
              </Text>
            )}
            {bookmark.tags.length > 0 && (
              <Text className="line-clamp-1 text-xs text-muted-foreground" numberOfLines={1}>
                {bookmark.tags.slice(0, 3).map((t) => t.name).join(" • ")}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View className="flex gap-2">
      <Pressable onPress={onOpenBookmark}>
        <BookmarkAssetImage
          assetId={assetImage}
          className="h-56 min-h-56 w-full object-cover"
        />
      </Pressable>
      <View className="flex gap-2 p-2">
        <Pressable onPress={onOpenBookmark}>
          {title && (
            <Text className="line-clamp-2 text-xl font-bold">{title}</Text>
          )}
        </Pressable>
        {note && <NotePreview note={note} bookmarkId={bookmark.id} />}
        <TagList bookmark={bookmark} />
        <Divider orientation="vertical" className="mt-2 h-0.5 w-full" />
        <View className="mt-2 flex flex-row justify-between px-2 pb-2">
          <View />
          <ActionBar bookmark={bookmark} />
        </View>
      </View>
    </View>
  );
}

export default function BookmarkCard({
  bookmark: initialData,
  layout = "card",
}: {
  bookmark: ZBookmark;
  layout?: "card" | "list";
}) {
  const { data: bookmark } = api.bookmarks.getBookmark.useQuery(
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
  );

  const router = useRouter();

  let comp;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      comp = (
        <LinkCard
          bookmark={bookmark}
          onOpenBookmark={() =>
            router.push(`/dashboard/bookmarks/${bookmark.id}`)
          }
          layout={layout}
        />
      );
      break;
    case BookmarkTypes.TEXT:
      comp = (
        <TextCard
          bookmark={bookmark}
          onOpenBookmark={() =>
            router.push(`/dashboard/bookmarks/${bookmark.id}`)
          }
          layout={layout}
        />
      );
      break;
    case BookmarkTypes.ASSET:
      comp = (
        <AssetCard
          bookmark={bookmark}
          onOpenBookmark={() =>
            router.push(`/dashboard/bookmarks/${bookmark.id}`)
          }
          layout={layout}
        />
      );
      break;
  }

  return <View className="overflow-hidden rounded-xl bg-card">{comp}</View>;
}
