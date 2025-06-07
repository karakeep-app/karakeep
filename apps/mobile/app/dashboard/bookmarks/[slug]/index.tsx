import React, { useState } from "react";
import {
  Alert,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import ImageView from "react-native-image-viewing";
import WebView from "react-native-webview";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import BookmarkAssetImage from "@/components/bookmarks/BookmarkAssetImage";
import BookmarkTextMarkdown from "@/components/bookmarks/BookmarkTextMarkdown";
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

function BookmarkLinkView({ bookmark }: { bookmark: ZBookmark }) {
  const { colorScheme } = useColorScheme();

  if (bookmark.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  if (bookmark.content.htmlContent) {
    const isDark = colorScheme === "dark";

    return (
      <View className="flex-1 bg-background">
        <WebView
          originWhitelist={["*"]}
          source={{
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                      line-height: 1.6;
                      color: ${isDark ? "#e5e7eb" : "#374151"};
                      margin: 0;
                      padding: 16px;
                      background: ${isDark ? "#000000" : "#ffffff"};
                    }
                    p { margin: 0 0 1em 0; }
                    h1, h2, h3, h4, h5, h6 { margin: 1.5em 0 0.5em 0; line-height: 1.2; }
                    img { max-width: 100%; height: auto; border-radius: 8px; }
                    a { color: #3b82f6; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                    blockquote { 
                      border-left: 4px solid ${isDark ? "#374151" : "#e5e7eb"}; 
                      margin: 1em 0; 
                      padding-left: 1em; 
                      color: ${isDark ? "#9ca3af" : "#6b7280"}; 
                    }
                    pre { 
                      background: ${isDark ? "#1f2937" : "#f3f4f6"}; 
                      padding: 1em; 
                      border-radius: 6px; 
                      overflow-x: auto; 
                    }
                  </style>
                </head>
                <body>
                  ${bookmark.content.htmlContent}
                </body>
              </html>
            `,
          }}
          style={{
            flex: 1,
            backgroundColor: isDark ? "#000000" : "#ffffff",
          }}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        />
      </View>
    );
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

  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }

  const {
    data: bookmark,
    error,
    refetch,
  } = api.bookmarks.getBookmark.useQuery({
    bookmarkId: slug,
    includeContent: true,
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
          headerTintColor: colorScheme === "dark" ? "#ffffff" : undefined,
          headerStyle: {
            backgroundColor: colorScheme === "dark" ? "#000000" : undefined,
          },
        }}
      />
      <View className="flex h-full">
        {comp}
        <BottomActions bookmark={bookmark} />
      </View>
    </CustomSafeAreaView>
  );
}
