import { useState } from "react";
import {
  Alert,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import ImageView from "react-native-image-viewing";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import BookmarkAssetImage from "@/components/bookmarks/BookmarkAssetImage";
import {
  BookmarkLinkArchivePreview,
  BookmarkLinkBrowserPreview,
  BookmarkLinkReaderPreview,
  BookmarkLinkScreenshotPreview,
} from "@/components/bookmarks/BookmarkLinkPreview";
import BookmarkTextMarkdown from "@/components/bookmarks/BookmarkTextMarkdown";
import { PDFViewer } from "@/components/bookmarks/PDFViewer";
import FullPageError from "@/components/FullPageError";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Button } from "@/components/ui/Button";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useAssetUrl } from "@/lib/hooks";
import useAppSettings from "@/lib/settings";
import { api } from "@/lib/trpc";
import { MenuView } from "@react-native-menu/menu";
import {
  ChevronDown,
  ClipboardList,
  Globe,
  Info,
  Tag,
  Trash2,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";

import {
  useDeleteBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

type BookmarkLinkType = "browser" | "reader" | "screenshot" | "archive";

function getAvailableViewTypes(bookmark: ZBookmark): BookmarkLinkType[] {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return [];
  }

  const availableTypes: BookmarkLinkType[] = ["browser", "reader"];

  if (bookmark.assets.some((asset) => asset.assetType === "screenshot")) {
    availableTypes.push("screenshot");
  }

  if (
    bookmark.assets.some(
      (asset) =>
        asset.assetType === "precrawledArchive" ||
        asset.assetType === "fullPageArchive",
    )
  ) {
    availableTypes.push("archive");
  }

  return availableTypes;
}

function BookmarkLinkTypeSelector({
  type,
  onChange,
  bookmark,
}: {
  type: BookmarkLinkType;
  onChange: (type: BookmarkLinkType) => void;
  bookmark: ZBookmark;
}) {
  const availableTypes = getAvailableViewTypes(bookmark);

  const allActions = [
    {
      id: "reader" as const,
      title: "Reader View",
      state: type === "reader" ? ("on" as const) : undefined,
    },
    {
      id: "browser" as const,
      title: "Browser",
      state: type === "browser" ? ("on" as const) : undefined,
    },
    {
      id: "screenshot" as const,
      title: "Screenshot",
      state: type === "screenshot" ? ("on" as const) : undefined,
    },
    {
      id: "archive" as const,
      title: "Archived Page",
      state: type === "archive" ? ("on" as const) : undefined,
    },
  ];

  const availableActions = allActions.filter((action) =>
    availableTypes.includes(action.id),
  );

  return (
    <MenuView
      onPressAction={({ nativeEvent }) => {
        Haptics.selectionAsync();
        onChange(nativeEvent.event as BookmarkLinkType);
      }}
      actions={availableActions}
      shouldOpenOnLongPress={false}
    >
      <ChevronDown onPress={() => Haptics.selectionAsync()} color="gray" />
    </MenuView>
  );
}

function BottomActions({ bookmark }: { bookmark: ZBookmark }) {
  const { toast } = useToast();
  const router = useRouter();

  const { mutate: deleteBookmark, isPending: isDeletionPending } =
    useDeleteBookmark({
      onSuccess: () => {
        router.back();
        toast({
          message: "The bookmark has been deleted!",
          showProgress: false,
        });
      },
      onError: () => {
        toast({
          message: "Something went wrong",
          variant: "destructive",
          showProgress: false,
        });
      },
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

  const actions = [
    {
      id: "lists",
      icon: (
        <TailwindResolver
          className="text-foreground"
          comp={(styles) => <ClipboardList color={styles?.color?.toString()} />}
        />
      ),
      shouldRender: true,
      onClick: () =>
        router.push(`/dashboard/bookmarks/${bookmark.id}/manage_lists`),
      disabled: false,
    },
    {
      id: "tags",
      icon: (
        <TailwindResolver
          className="text-foreground"
          comp={(styles) => <Tag color={styles?.color?.toString()} />}
        />
      ),
      shouldRender: true,
      onClick: () =>
        router.push(`/dashboard/bookmarks/${bookmark.id}/manage_tags`),
      disabled: false,
    },
    {
      id: "open",
      icon: (
        <TailwindResolver
          className="text-foreground"
          comp={(styles) => <Info color={styles?.color?.toString()} />}
        />
      ),
      shouldRender: true,
      onClick: () => router.push(`/dashboard/bookmarks/${bookmark.id}/info`),
      disabled: false,
    },
    {
      id: "delete",
      icon: (
        <TailwindResolver
          className="text-foreground"
          comp={(styles) => <Trash2 color={styles?.color?.toString()} />}
        />
      ),
      shouldRender: true,
      onClick: deleteBookmarkAlert,
      disabled: isDeletionPending,
    },
    {
      id: "browser",
      icon: (
        <TailwindResolver
          className="text-foreground"
          comp={(styles) => <Globe color={styles?.color?.toString()} />}
        />
      ),
      shouldRender: bookmark.content.type == BookmarkTypes.LINK,
      onClick: () =>
        bookmark.content.type == BookmarkTypes.LINK &&
        Linking.openURL(bookmark.content.url),
      disabled: false,
    },
  ];
  return (
    <View>
      <View className="flex flex-row items-center justify-between px-10 pb-2 pt-4">
        {actions.map(
          (a) =>
            a.shouldRender && (
              <Pressable
                disabled={a.disabled}
                key={a.id}
                onPress={a.onClick}
                className="py-auto"
              >
                {a.icon}
              </Pressable>
            ),
        )}
      </View>
    </View>
  );
}

function BookmarkLinkView({
  bookmark,
  bookmarkPreviewType,
}: {
  bookmark: ZBookmark;
  bookmarkPreviewType: BookmarkLinkType;
}) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  switch (bookmarkPreviewType) {
    case "browser":
      return <BookmarkLinkBrowserPreview bookmark={bookmark} />;
    case "reader":
      return <BookmarkLinkReaderPreview bookmark={bookmark} />;
    case "screenshot":
      return <BookmarkLinkScreenshotPreview bookmark={bookmark} />;
    case "archive":
      return <BookmarkLinkArchivePreview bookmark={bookmark} />;
  }
}

function BookmarkTextView({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.TEXT) {
    throw new Error("Wrong content type rendered");
  }
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const initialText = bookmark.content.text;
  const [content, setContent] = useState(initialText);

  const { mutate, isPending } = useUpdateBookmark({
    onError: () => {
      toast({
        message: "Something went wrong",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      setIsEditing(false);
    },
  });

  return (
    <View className="flex-1">
      {isEditing && (
        <View className="absolute right-0 top-0 z-10 m-4 flex flex-row gap-1">
          <Button label="Save" variant="default" onPress={Keyboard.dismiss} />
          <Button
            label="Discard"
            variant="destructive"
            onPress={() => {
              setContent(initialText);
              setIsEditing(false);
            }}
          />
        </View>
      )}
      <ScrollView className="flex bg-background p-2">
        {isEditing ? (
          <Input
            loading={isPending}
            editable={!isPending}
            onBlur={() =>
              mutate({
                bookmarkId: bookmark.id,
                text: content,
              })
            }
            value={content}
            onChangeText={setContent}
            multiline
            autoFocus
          />
        ) : (
          <Pressable onPress={() => setIsEditing(true)}>
            <View className="mb-4 rounded-xl border border-accent p-2">
              <BookmarkTextMarkdown text={content} />
            </View>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function BookmarkAssetView({ bookmark }: { bookmark: ZBookmark }) {
  const [imageZoom, setImageZoom] = useState(false);
  if (bookmark.content.type !== BookmarkTypes.ASSET) {
    throw new Error("Wrong content type rendered");
  }
  const assetSource = useAssetUrl(bookmark.content.assetId);

  // Check if this is a PDF asset
  if (bookmark.content.assetType === "pdf") {
    return (
      <View className="flex flex-1">
        <PDFViewer
          source={assetSource.uri ?? ""}
          headers={assetSource.headers}
        />
      </View>
    );
  }

  // Handle image assets as before
  return (
    <View className="flex flex-1 gap-2">
      <ImageView
        visible={imageZoom}
        imageIndex={0}
        onRequestClose={() => setImageZoom(false)}
        doubleTapToZoomEnabled={true}
        images={[assetSource]}
      />

      <Pressable onPress={() => setImageZoom(true)}>
        <BookmarkAssetImage
          assetId={bookmark.content.assetId}
          className="h-56 min-h-56 w-full object-cover"
        />
      </Pressable>
    </View>
  );
}

export default function ListView() {
  const { slug } = useLocalSearchParams();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { settings } = useAppSettings();

  const [bookmarkLinkType, setBookmarkLinkType] = useState<BookmarkLinkType>(
    settings.defaultBookmarkView,
  );

  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }

  const {
    data: bookmark,
    error,
    refetch,
  } = api.bookmarks.getBookmark.useQuery({
    bookmarkId: slug,
    includeContent: false,
  });

  if (error) {
    return <FullPageError error={error.message} onRetry={refetch} />;
  }

  if (!bookmark) {
    return <FullPageSpinner />;
  }

  let comp;
  let title = null;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      title = bookmark.title ?? bookmark.content.title;
      comp = (
        <BookmarkLinkView
          bookmark={bookmark}
          bookmarkPreviewType={bookmarkLinkType}
        />
      );
      break;
    case BookmarkTypes.TEXT:
      title = bookmark.title;
      comp = <BookmarkTextView bookmark={bookmark} />;
      break;
    case BookmarkTypes.ASSET:
      title = bookmark.title ?? bookmark.content.fileName;
      comp = <BookmarkAssetView bookmark={bookmark} />;
      break;
  }
  return (
    <CustomSafeAreaView edges={["bottom"]}>
      <Stack.Screen
        options={{
          headerTitle: title ?? "",
          headerBackTitle: "Back",
          headerTransparent: false,
          headerShown: true,
          headerStyle: {
            backgroundColor: isDark ? "#000" : "#fff",
          },
          headerTintColor: isDark ? "#fff" : "#000",
          headerRight: () =>
            bookmark.content.type === BookmarkTypes.LINK ? (
              <BookmarkLinkTypeSelector
                type={bookmarkLinkType}
                onChange={(type) => setBookmarkLinkType(type)}
                bookmark={bookmark}
              />
            ) : undefined,
        }}
      />
      <View className="flex h-full">
        {comp}
        <BottomActions bookmark={bookmark} />
      </View>
    </CustomSafeAreaView>
  );
}
