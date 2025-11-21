import React from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardGestureArea,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  ChevronUp,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react-native";
import TagPill from "@/components/bookmarks/TagPill";
import BookmarkTextMarkdown from "@/components/bookmarks/BookmarkTextMarkdown";
import FullPageError from "@/components/FullPageError";
import { Button } from "@/components/ui/Button";
import ChevronRight from "@/components/ui/ChevronRight";
import { Divider } from "@/components/ui/Divider";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

import {
  useAutoRefreshingBookmarkQuery,
  useDeleteBookmark,
  useSummarizeBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { isBookmarkStillTagging } from "@karakeep/shared/utils/bookmarkUtils";

function InfoSection({
  className,
  ...props
}: React.ComponentProps<typeof View>) {
  return (
    <View
      className={cn("flex gap-2 rounded-lg bg-card p-3", className)}
      {...props}
    />
  );
}

function TagList({ bookmark }: { bookmark: ZBookmark }) {
  return (
    <InfoSection>
      {isBookmarkStillTagging(bookmark) ? (
        <View className="flex gap-4 pb-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </View>
      ) : (
        bookmark.tags.length > 0 && (
          <>
            <View className="flex flex-row flex-wrap gap-2 rounded-lg p-2">
              {bookmark.tags.map((t) => (
                <TagPill key={t.id} tag={t} />
              ))}
            </View>
            <Divider orientation="horizontal" />
          </>
        )
      )}
      <View>
        <Pressable
          onPress={() =>
            router.push(`/dashboard/bookmarks/${bookmark.id}/manage_tags`)
          }
          className="flex w-full flex-row justify-between gap-3"
        >
          <Text>Manage Tags</Text>
          <ChevronRight />
        </Pressable>
      </View>
    </InfoSection>
  );
}

function ManageLists({ bookmark }: { bookmark: ZBookmark }) {
  return (
    <InfoSection>
      <View>
        <Pressable
          onPress={() =>
            router.push(`/dashboard/bookmarks/${bookmark.id}/manage_lists`)
          }
          className="flex w-full flex-row justify-between gap-3 rounded-lg"
        >
          <Text>Manage Lists</Text>
          <ChevronRight />
        </Pressable>
      </View>
    </InfoSection>
  );
}

function TitleEditor({
  title,
  setTitle,
  isPending,
}: {
  title: string | null | undefined;
  setTitle: (title: string | null) => void;
  isPending: boolean;
}) {
  return (
    <InfoSection>
      <Input
        editable={!isPending}
        multiline={false}
        numberOfLines={1}
        placeholder="Title"
        onChangeText={(text) => setTitle(text)}
        defaultValue={title ?? ""}
      />
    </InfoSection>
  );
}

function NotesEditor({
  notes,
  setNotes,
  isPending,
}: {
  notes: string | null | undefined;
  setNotes: (title: string | null) => void;
  isPending: boolean;
}) {
  return (
    <InfoSection>
      <Input
        editable={!isPending}
        multiline={true}
        placeholder="Notes"
        inputClasses="h-24"
        onChangeText={(text) => setNotes(text)}
        textAlignVertical="top"
        defaultValue={notes ?? ""}
      />
    </InfoSection>
  );
}

function AISummarySection({ bookmark }: { bookmark: ZBookmark }) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = React.useState(false);

  const { mutate: summarize, isPending: isSummarizing } = useSummarizeBookmark({
    onSuccess: () => {
      toast({
        message: "Summary generated successfully!",
        showProgress: false,
      });
    },
    onError: () => {
      toast({
        message: "Failed to generate summary",
        showProgress: false,
      });
    },
  });

  const { mutate: resummarize, isPending: isResummarizing } =
    useSummarizeBookmark({
      onSuccess: () => {
        toast({
          message: "Summary regenerated successfully!",
          showProgress: false,
        });
      },
      onError: () => {
        toast({
          message: "Failed to regenerate summary",
          showProgress: false,
        });
      },
    });

  const { mutate: updateBookmark, isPending: isDeletingSummary } =
    useUpdateBookmark({
      onSuccess: () => {
        toast({
          message: "Summary deleted!",
          showProgress: false,
        });
      },
      onError: () => {
        toast({
          message: "Failed to delete summary",
          showProgress: false,
        });
      },
    });

  // Only show for LINK bookmarks
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  // If there's a summary, show it
  if (bookmark.summary) {
    return (
      <InfoSection className="border-2 border-purple-400 dark:border-purple-600">
        <Pressable
          onPress={() => !isExpanded && setIsExpanded(true)}
          disabled={isExpanded}
        >
          <View className="rounded-lg bg-purple-50 p-3 dark:bg-purple-950/30">
            <View className={isExpanded ? "" : "max-h-20 overflow-hidden"}>
              <BookmarkTextMarkdown text={bookmark.summary} />
            </View>
            {isExpanded && (
              <View className="mt-2 flex flex-row justify-end gap-2">
                <Pressable
                  onPress={() =>
                    resummarize({ bookmarkId: bookmark.id })
                  }
                  disabled={isResummarizing}
                  className="rounded-full bg-gray-200 p-2 dark:bg-gray-700"
                >
                  {isResummarizing ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <RefreshCw size={16} className="text-gray-600 dark:text-gray-400" />
                  )}
                </Pressable>
                <Pressable
                  onPress={() =>
                    updateBookmark({ bookmarkId: bookmark.id, summary: null })
                  }
                  disabled={isDeletingSummary}
                  className="rounded-full bg-gray-200 p-2 dark:bg-gray-700"
                >
                  {isDeletingSummary ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Trash2 size={16} className="text-gray-600 dark:text-gray-400" />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setIsExpanded(false)}
                  className="rounded-full bg-gray-200 p-2 dark:bg-gray-700"
                >
                  <ChevronUp size={16} className="text-gray-600 dark:text-gray-400" />
                </Pressable>
              </View>
            )}
          </View>
        </Pressable>
      </InfoSection>
    );
  }

  // If no summary, show button to generate one
  return (
    <InfoSection>
      <Pressable
        onPress={() => summarize({ bookmarkId: bookmark.id })}
        disabled={isSummarizing}
        className="rounded-lg bg-purple-500 p-3 dark:bg-purple-600"
      >
        <View className="flex flex-row items-center justify-center gap-2">
          {isSummarizing ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text className="font-medium text-white">Generating summary...</Text>
            </>
          ) : (
            <>
              <Text className="font-medium text-white">Summarize with AI</Text>
              <Sparkles size={16} color="#fff" />
            </>
          )}
        </View>
      </Pressable>
    </InfoSection>
  );
}

const ViewBookmarkPage = () => {
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams();
  const { toast } = useToast();
  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }

  const { mutate: editBookmark, isPending: isEditPending } = useUpdateBookmark({
    onSuccess: () => {
      toast({
        message: "The bookmark has been updated!",
        showProgress: false,
      });
      setEditedBookmark({});
    },
  });

  const { mutate: deleteBookmark, isPending: isDeletionPending } =
    useDeleteBookmark({
      onSuccess: () => {
        router.replace("dashboard");
        toast({
          message: "The bookmark has been deleted!",
          showProgress: false,
        });
      },
    });

  const {
    data: bookmark,
    isPending,
    refetch,
  } = useAutoRefreshingBookmarkQuery({
    bookmarkId: slug,
  });

  const [editedBookmark, setEditedBookmark] = React.useState<{
    title?: string | null;
    note?: string;
  }>({});

  if (isPending) {
    return <FullPageSpinner />;
  }

  if (!bookmark) {
    return (
      <FullPageError error="Bookmark not found" onRetry={() => refetch()} />
    );
  }

  const handleDeleteBookmark = () => {
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
  };

  const onDone = () => {
    const doDone = () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("dashboard");
      }
    };
    if (Object.keys(editedBookmark).length === 0) {
      doDone();
      return;
    }
    Alert.alert("You have unsaved changes", "Do you still want to leave?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        onPress: doDone,
      },
    ]);
  };

  let title = null;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      title = bookmark.title ?? bookmark.content.title;
      break;
    case BookmarkTypes.TEXT:
      title = bookmark.title;
      break;
    case BookmarkTypes.ASSET:
      title = bookmark.title ?? bookmark.content.fileName;
      break;
  }
  return (
    <KeyboardGestureArea interpolator="ios">
      <KeyboardAwareScrollView
        className="p-4"
        bottomOffset={8}
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingBottom: insets.bottom }}
      >
        <Stack.Screen
          options={{
            headerShown: true,
            headerTransparent: false,
            headerTitle: title ?? "Untitled",
            headerRight: () => (
              <Pressable onPress={onDone}>
                <Text>Done</Text>
              </Pressable>
            ),
          }}
        />
        <View className="gap-4">
          <TitleEditor
            title={title}
            setTitle={(title) =>
              setEditedBookmark((prev) => ({ ...prev, title }))
            }
            isPending={isEditPending}
          />
          <AISummarySection bookmark={bookmark} />
          <TagList bookmark={bookmark} />
          <ManageLists bookmark={bookmark} />
          <NotesEditor
            notes={bookmark.note}
            setNotes={(note) =>
              setEditedBookmark((prev) => ({ ...prev, note: note ?? "" }))
            }
            isPending={isEditPending}
          />
          <View className="flex justify-between gap-3">
            <Button
              onPress={() =>
                editBookmark({
                  bookmarkId: bookmark.id,
                  ...editedBookmark,
                })
              }
              disabled={isEditPending}
            >
              <Text>Save</Text>
            </Button>
            <Button
              variant="destructive"
              onPress={handleDeleteBookmark}
              disabled={isDeletionPending}
            >
              <Text>Delete</Text>
            </Button>
          </View>
          <View className="gap-2">
            <Text className="items-center text-center">
              Created {bookmark.createdAt.toLocaleString()}
            </Text>
            {bookmark.modifiedAt &&
              bookmark.modifiedAt.getTime() !==
                bookmark.createdAt.getTime() && (
                <Text className="items-center text-center">
                  Modified {bookmark.modifiedAt.toLocaleString()}
                </Text>
              )}
          </View>
        </View>
      </KeyboardAwareScrollView>
    </KeyboardGestureArea>
  );
};

export default ViewBookmarkPage;
