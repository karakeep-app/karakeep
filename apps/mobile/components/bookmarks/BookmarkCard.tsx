import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { buildApiHeaders } from "@/lib/utils";
import { MenuView } from "@react-native-menu/menu";
import { useQuery } from "@tanstack/react-query";
import { Ellipsis, ShareIcon, Star } from "lucide-react-native";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  useDeleteBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import { useTRPC } from "@karakeep/shared-react/trpc";
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
  const { data: currentUser } = useWhoAmI();
  const { menuIconColor, destructiveMenuIconColor } = useMenuIconColors();

  // Check if the current user owns this bookmark
  const isOwner = currentUser?.id === bookmark.userId;

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
                  headers: buildApiHeaders(
                    settings.apiKey,
                    settings.customHeaders,
                  ),
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
          } else if (bookmark.content.assetType === "pdf") {
            if (await Sharing.isAvailableAsync()) {
              const assetUrl = `${settings.address}/api/assets/${bookmark.content.assetId}`;
              const fileName = bookmark.content.fileName || "document.pdf";
              const fileUri = `${FileSystem.documentDirectory}${fileName}`;

              const downloadResult = await FileSystem.downloadAsync(
                assetUrl,
                fileUri,
                {
                  headers: buildApiHeaders(
                    settings.apiKey,
                    settings.customHeaders,
                  ),
                },
              );

              if (downloadResult.status === 200) {
                await Sharing.shareAsync(downloadResult.uri, {
                  mimeType: "application/pdf",
                  UTI: "com.adobe.pdf",
                });
                // Clean up the temporary file
                await FileSystem.deleteAsync(downloadResult.uri, {
                  idempotent: true,
                });
              } else {
                throw new Error("Failed to download PDF");
              }
            }
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

  // Build actions array based on ownership
  const menuActions = [];
  if (isOwner) {
    menuActions.push(
      {
        id: "edit",
        title: "Edit",
        image: Platform.select({
          ios: "pencil",
        }),
        imageColor: Platform.select({
          ios: menuIconColor,
        }),
      },
      {
        id: "manage_list",
        title: "Manage Lists",
        image: Platform.select({
          ios: "list.bullet",
        }),
        imageColor: Platform.select({
          ios: menuIconColor,
        }),
      },
      {
        id: "manage_tags",
        title: "Manage Tags",
        image: Platform.select({
          ios: "tag",
        }),
        imageColor: Platform.select({
          ios: menuIconColor,
        }),
      },
      {
        id: "archive",
        title: bookmark.archived ? "Un-archive" : "Archive",
        image: Platform.select({
          ios: "folder",
        }),
        imageColor: Platform.select({
          ios: menuIconColor,
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
        imageColor: Platform.select({
          ios: destructiveMenuIconColor,
        }),
      },
    );
  }

  return (
    <View className="flex flex-row gap-4">
      {(isArchivePending || isDeletionPending) && <ActivityIndicator />}
      {isOwner && (
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
      )}

      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          handleShare();
        }}
      >
        <ShareIcon color="gray" />
      </Pressable>

      {isOwner && menuActions.length > 0 && (
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
          actions={menuActions}
          shouldOpenOnLongPress={false}
        >
          <Ellipsis onPress={() => Haptics.selectionAsync()} color="gray" />
        </MenuView>
      )}
    </View>
  );
}

function TagList({ bookmark }: { bookmark: ZBookmark }) {
  const tags = bookmark.tags;
  const { data: currentUser } = useWhoAmI();
  const isOwner = currentUser?.id === bookmark.userId;

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
          <TagPill key={t.id} tag={t} clickable={isOwner} />
        ))}
      </View>
    </ScrollView>
  );
}

function LinkCard({
  bookmark,
  onOpenBookmark,
}: {
  bookmark: ZBookmark;
  onOpenBookmark: () => void;
}) {
  const { settings } = useAppSettings();
  const { data: currentUser } = useWhoAmI();
  const isOwner = currentUser?.id === bookmark.userId;

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
    imageComp = (
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

  return (
    <View className="flex gap-2">
      <Pressable onPress={onOpenBookmark}>{imageComp}</Pressable>
      <View className="flex gap-2 p-2">
        <Text
          className="text-xl font-bold text-foreground"
          numberOfLines={2}
          onPress={onOpenBookmark}
        >
          {bookmark.title ?? bookmark.content.title ?? parsedUrl.host}
        </Text>
        {note && (
          <NotePreview
            note={note}
            bookmarkId={bookmark.id}
            readOnly={!isOwner}
          />
        )}
        <TagList bookmark={bookmark} />
        <Divider orientation="vertical" className="mt-2 h-0.5 w-full" />
        <View className="mt-2 flex flex-row justify-between px-2 pb-2">
          <Text className="my-auto" numberOfLines={1}>
            {parsedUrl.host}
          </Text>
          <ActionBar bookmark={bookmark} />
        </View>
      </View>
    </View>
  );
}

function TextCard({
  bookmark,
  onOpenBookmark,
}: {
  bookmark: ZBookmark;
  onOpenBookmark: () => void;
}) {
  const { settings } = useAppSettings();
  const { data: currentUser } = useWhoAmI();
  const isOwner = currentUser?.id === bookmark.userId;

  if (bookmark.content.type !== BookmarkTypes.TEXT) {
    throw new Error("Wrong content type rendered");
  }
  const note = settings.showNotes ? bookmark.note?.trim() : undefined;
  const content = bookmark.content.text;
  return (
    <View className="flex max-h-96 gap-2 p-2">
      <Pressable onPress={onOpenBookmark}>
        {bookmark.title && (
          <Text className="text-xl font-bold" numberOfLines={2}>
            {bookmark.title}
          </Text>
        )}
      </Pressable>
      <View className="max-h-56 overflow-hidden p-2 text-foreground">
        <Pressable onPress={onOpenBookmark}>
          <BookmarkTextMarkdown text={content} />
        </Pressable>
      </View>
      {note && (
        <NotePreview note={note} bookmarkId={bookmark.id} readOnly={!isOwner} />
      )}
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
}: {
  bookmark: ZBookmark;
  onOpenBookmark: () => void;
}) {
  const { settings } = useAppSettings();
  const { data: currentUser } = useWhoAmI();
  const isOwner = currentUser?.id === bookmark.userId;

  if (bookmark.content.type !== BookmarkTypes.ASSET) {
    throw new Error("Wrong content type rendered");
  }
  const note = settings.showNotes ? bookmark.note?.trim() : undefined;
  const title = bookmark.title ?? bookmark.content.fileName;

  const assetImage =
    bookmark.assets.find((r) => r.assetType == "assetScreenshot")?.id ??
    bookmark.content.assetId;

  return (
    <View className="flex gap-2">
      <Pressable onPress={onOpenBookmark}>
        <BookmarkAssetImage
          assetId={assetImage}
          className="h-56 min-h-56 w-full"
        />
      </Pressable>
      <View className="flex gap-2 p-2">
        <Pressable onPress={onOpenBookmark}>
          {title && (
            <Text numberOfLines={2} className="text-xl font-bold">
              {title}
            </Text>
          )}
        </Pressable>
        {note && (
          <NotePreview
            note={note}
            bookmarkId={bookmark.id}
            readOnly={!isOwner}
          />
        )}
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

  let comp;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      comp = (
        <LinkCard
          bookmark={bookmark}
          onOpenBookmark={() =>
            router.push(`/dashboard/bookmarks/${bookmark.id}`)
          }
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
        />
      );
      break;
  }

  return (
    <View
      className="overflow-hidden rounded-xl bg-card"
      style={{ borderCurve: "continuous" }}
    >
      {comp}
    </View>
  );
}
