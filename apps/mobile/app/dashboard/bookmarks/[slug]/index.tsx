import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";
import ImageView from "react-native-image-viewing";
import WebView from "react-native-webview";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import BookmarkAssetImage from "@/components/bookmarks/BookmarkAssetImage";
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
import { api } from "@/lib/trpc";
import { ClipboardList, Globe, Info, Tag, Trash2 } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import {
  useDeleteBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

function BottomActions({ bookmark }: { bookmark: ZBookmark }) {
  const { toast } = useToast();
  const router = useRouter();
  const [isOpeningExternally, setIsOpeningExternally] = useState(false);

  // Always call the hook, but only use it for assets
  const assetId =
    bookmark.content.type === BookmarkTypes.ASSET
      ? bookmark.content.assetId
      : "dummy";
  const rawAssetUrl = useAssetUrl(assetId);
  const assetUrl =
    bookmark.content.type === BookmarkTypes.ASSET && bookmark.content.assetId
      ? rawAssetUrl
      : null;

  const openPDFExternally = async () => {
    if (!assetUrl) return;

    try {
      setIsOpeningExternally(true);

      // Download PDF to a temporary location
      // Use original filename if available, otherwise use title or fallback
      let fileName = "document.pdf";
      if (
        bookmark.content.type === BookmarkTypes.ASSET &&
        bookmark.content.fileName
      ) {
        // Use original filename if it has .pdf extension
        fileName = bookmark.content.fileName.endsWith(".pdf")
          ? bookmark.content.fileName
          : `${bookmark.content.fileName}.pdf`;
      } else if (bookmark.title) {
        // Sanitize title for filename
        fileName = `${bookmark.title.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;
      }

      const { dirs } = ReactNativeBlobUtil.fs;
      const path = `${dirs.DocumentDir}/${fileName}`;

      const response = await ReactNativeBlobUtil.config({
        fileCache: true,
        path: path,
      }).fetch("GET", assetUrl?.uri ?? "", assetUrl?.headers ?? {});

      const downloadedPath = response.path();

      // Open the downloaded file in the default PDF viewer
      if (Platform.OS === "ios") {
        // On iOS, use the iOS-specific openDocument method
        await ReactNativeBlobUtil.ios.openDocument(downloadedPath);
      } else {
        // On Android, use react-native-blob-util's intent to open the file
        // This handles the content provider properly
        ReactNativeBlobUtil.android.actionViewIntent(
          downloadedPath,
          "application/pdf",
        );
      }

      // Clean up the temporary file after opening
      setTimeout(() => {
        ReactNativeBlobUtil.fs.unlink(downloadedPath).catch(() => {
          // Ignore cleanup errors
        });
      }, 60000); // Clean up after 1 minute
    } catch (error) {
      console.error("Error opening PDF:", error);
      toast({
        message: "Failed to open PDF",
        variant: "destructive",
      });
    } finally {
      setIsOpeningExternally(false);
    }
  };

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
    {
      id: "open-pdf",
      icon: isOpeningExternally ? (
        <ActivityIndicator size="small" />
      ) : (
        <TailwindResolver
          className="text-foreground"
          comp={(styles) => <Globe color={styles?.color?.toString()} />}
        />
      ),
      shouldRender:
        bookmark.content.type == BookmarkTypes.ASSET &&
        bookmark.content.assetType === "pdf",
      onClick: openPDFExternally,
      disabled: isOpeningExternally,
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

function BookmarkLinkView({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }
  return (
    <WebView
      startInLoadingState={true}
      mediaPlaybackRequiresUserAction={true}
      source={{ uri: bookmark.content.url }}
    />
  );
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

  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }

  const {
    data: bookmark,
    error,
    refetch,
  } = api.bookmarks.getBookmark.useQuery({ bookmarkId: slug });

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
      comp = <BookmarkLinkView bookmark={bookmark} />;
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
        }}
      />
      <View className="flex h-full">
        {comp}
        <BottomActions bookmark={bookmark} />
      </View>
    </CustomSafeAreaView>
  );
}
