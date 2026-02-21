import React from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
  View,
} from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardGestureArea,
} from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import BookmarkTextMarkdown from "@/components/bookmarks/BookmarkTextMarkdown";
import TagPill from "@/components/bookmarks/TagPill";
import FullPageError from "@/components/FullPageError";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import {
  GroupedSection,
  NavigationRow,
  RowSeparator,
} from "@/components/ui/GroupedList";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/lib/useColorScheme";
import { ChevronUp, RefreshCw, Sparkles, Trash2 } from "lucide-react-native";

import {
  useAutoRefreshingBookmarkQuery,
  useDeleteBookmark,
  useSummarizeBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { isBookmarkStillTagging } from "@karakeep/shared/utils/bookmarkUtils";

// --- Section Components ---

function TitleEditor({
  title,
  setTitle,
  isPending,
  disabled,
}: {
  title: string | null | undefined;
  setTitle: (title: string | null) => void;
  isPending: boolean;
  disabled?: boolean;
}) {
  const { colors } = useColorScheme();
  return (
    <GroupedSection header="Title">
      <TextInput
        editable={!isPending && !disabled}
        placeholder="Untitled"
        placeholderTextColor={colors.grey}
        onChangeText={(text) => setTitle(text)}
        defaultValue={title ?? ""}
        className="px-4 py-3 text-[17px] leading-6 text-foreground"
      />
    </GroupedSection>
  );
}

function NotesEditor({
  notes,
  setNotes,
  isPending,
  disabled,
}: {
  notes: string | null | undefined;
  setNotes: (note: string | null) => void;
  isPending: boolean;
  disabled?: boolean;
}) {
  const { colors } = useColorScheme();
  return (
    <GroupedSection header="Notes">
      <TextInput
        editable={!isPending && !disabled}
        multiline
        placeholder="Add notes..."
        placeholderTextColor={colors.grey}
        onChangeText={(text) => setNotes(text)}
        textAlignVertical="top"
        defaultValue={notes ?? ""}
        className="min-h-[100px] px-4 py-3 text-[17px] leading-6 text-foreground"
      />
    </GroupedSection>
  );
}

function TagList({
  bookmark,
  readOnly,
}: {
  bookmark: ZBookmark;
  readOnly: boolean;
}) {
  const hasTags = bookmark.tags.length > 0;
  const isTagging = isBookmarkStillTagging(bookmark);

  if (!isTagging && !hasTags && readOnly) {
    return null;
  }

  return (
    <GroupedSection header="Tags">
      {isTagging ? (
        <View className="gap-3 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </View>
      ) : (
        hasTags && (
          <>
            <View className="flex-row flex-wrap gap-2 px-4 py-3">
              {bookmark.tags.map((t) => (
                <TagPill key={t.id} tag={t} clickable={!readOnly} />
              ))}
            </View>
            {!readOnly && <RowSeparator />}
          </>
        )
      )}
      {!readOnly && (
        <NavigationRow
          label="Manage Tags"
          onPress={() =>
            router.push(`/dashboard/bookmarks/${bookmark.id}/manage_tags`)
          }
        />
      )}
    </GroupedSection>
  );
}

function ManageLists({ bookmark }: { bookmark: ZBookmark }) {
  return (
    <GroupedSection header="Lists">
      <NavigationRow
        label="Manage Lists"
        onPress={() =>
          router.push(`/dashboard/bookmarks/${bookmark.id}/manage_lists`)
        }
      />
    </GroupedSection>
  );
}

function AISummarySection({
  bookmark,
  readOnly,
}: {
  bookmark: ZBookmark;
  readOnly: boolean;
}) {
  const { toast } = useToast();
  const { colors } = useColorScheme();
  const [isExpanded, setIsExpanded] = React.useState(false);

  const { mutate: summarize, isPending: isSummarizing } = useSummarizeBookmark({
    onSuccess: () => {
      toast({ message: "Summary generated!", showProgress: false });
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
        toast({ message: "Summary regenerated!", showProgress: false });
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
        toast({ message: "Summary deleted!", showProgress: false });
      },
      onError: () => {
        toast({
          message: "Failed to delete summary",
          showProgress: false,
        });
      },
    });

  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  if (bookmark.summary) {
    return (
      <GroupedSection header="AI Summary">
        <Pressable
          onPress={() => setIsExpanded(!isExpanded)}
          className="px-4 py-3"
        >
          <View className={isExpanded ? "" : "max-h-16 overflow-hidden"}>
            <BookmarkTextMarkdown text={bookmark.summary} />
          </View>
          {!isExpanded && (
            <Text variant="footnote" className="mt-1.5 text-primary">
              Show more
            </Text>
          )}
        </Pressable>
        {isExpanded && !readOnly && (
          <>
            <RowSeparator />
            <View className="flex-row justify-end gap-1 px-2 py-2">
              <Pressable
                onPress={() => resummarize({ bookmarkId: bookmark.id })}
                disabled={isResummarizing}
                className="rounded-full p-2.5 active:opacity-70"
              >
                {isResummarizing ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <RefreshCw size={18} color={colors.grey} />
                )}
              </Pressable>
              <Pressable
                onPress={() =>
                  updateBookmark({ bookmarkId: bookmark.id, summary: null })
                }
                disabled={isDeletingSummary}
                className="rounded-full p-2.5 active:opacity-70"
              >
                {isDeletingSummary ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Trash2 size={18} color={colors.grey} />
                )}
              </Pressable>
              <Pressable
                onPress={() => setIsExpanded(false)}
                className="rounded-full p-2.5 active:opacity-70"
              >
                <ChevronUp size={18} color={colors.grey} />
              </Pressable>
            </View>
          </>
        )}
      </GroupedSection>
    );
  }

  if (readOnly) {
    return null;
  }

  return (
    <GroupedSection>
      <Pressable
        onPress={() => summarize({ bookmarkId: bookmark.id })}
        disabled={isSummarizing}
        className="flex-row items-center justify-center gap-2 px-4 py-3 active:opacity-70"
      >
        {isSummarizing ? (
          <>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text className="text-primary">Generating...</Text>
          </>
        ) : (
          <>
            <Sparkles size={16} color={colors.primary} />
            <Text className="text-primary">Summarize with AI</Text>
          </>
        )}
      </Pressable>
    </GroupedSection>
  );
}

// --- Main Page ---

const ViewBookmarkPage = () => {
  const { slug } = useLocalSearchParams();
  const { toast } = useToast();
  const { data: currentUser } = useWhoAmI();
  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }

  const [editedBookmark, setEditedBookmark] = React.useState<{
    title?: string | null;
    note?: string;
  }>({});

  const hasChanges = Object.keys(editedBookmark).length > 0;

  const { mutate: editBookmark, isPending: isEditPending } = useUpdateBookmark({
    onSuccess: () => {
      toast({ message: "Bookmark updated!", showProgress: false });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("dashboard");
      }
    },
    onError: () => {
      toast({ message: "Failed to save changes", showProgress: false });
    },
  });

  const { mutate: deleteBookmark, isPending: isDeletionPending } =
    useDeleteBookmark({
      onSuccess: () => {
        router.replace("dashboard");
        toast({ message: "Bookmark deleted!", showProgress: false });
      },
    });

  const {
    data: bookmark,
    isPending,
    refetch,
  } = useAutoRefreshingBookmarkQuery({
    bookmarkId: slug,
  });

  const isOwner = currentUser?.id === bookmark?.userId;

  const onDone = () => {
    const dismiss = () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("dashboard");
      }
    };

    if (hasChanges && bookmark) {
      editBookmark({ bookmarkId: bookmark.id, ...editedBookmark });
    } else {
      dismiss();
    }
  };

  if (isPending) {
    return <FullPageSpinner />;
  }

  if (!bookmark) {
    return (
      <FullPageError error="Bookmark not found" onRetry={() => refetch()} />
    );
  }

  const handleDeleteBookmark = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Delete Bookmark",
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

  let title: string | null = null;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      title = bookmark.title ?? bookmark.content.title ?? null;
      break;
    case BookmarkTypes.TEXT:
      title = bookmark.title ?? null;
      break;
    case BookmarkTypes.ASSET:
      title = bookmark.title ?? bookmark.content.fileName ?? null;
      break;
  }

  return (
    <KeyboardGestureArea interpolator="ios">
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: false,
          headerTitle: "Info",
          headerRight: () => (
            <Pressable onPress={onDone} disabled={isEditPending}>
              {isEditPending ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text
                  className={
                    hasChanges ? "font-semibold text-primary" : "text-primary"
                  }
                >
                  {hasChanges ? "Save" : "Done"}
                </Text>
              )}
            </Pressable>
          ),
        }}
      />
      <KeyboardAwareScrollView
        bottomOffset={8}
        keyboardDismissMode="interactive"
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}
        className="bg-background"
      >
        <TitleEditor
          title={title}
          setTitle={(t) => setEditedBookmark((prev) => ({ ...prev, title: t }))}
          isPending={isEditPending}
          disabled={!isOwner}
        />
        <AISummarySection bookmark={bookmark} readOnly={!isOwner} />
        <TagList bookmark={bookmark} readOnly={!isOwner} />
        {isOwner && <ManageLists bookmark={bookmark} />}
        <NotesEditor
          notes={bookmark.note}
          setNotes={(note) =>
            setEditedBookmark((prev) => ({ ...prev, note: note ?? "" }))
          }
          isPending={isEditPending}
          disabled={!isOwner}
        />
        {isOwner && (
          <GroupedSection>
            <Pressable
              onPress={handleDeleteBookmark}
              disabled={isDeletionPending}
              className="items-center px-4 py-3 active:opacity-70"
            >
              <Text className="text-destructive">
                {isDeletionPending ? "Deleting..." : "Delete Bookmark"}
              </Text>
            </Pressable>
          </GroupedSection>
        )}
        <View className="items-center gap-1 pt-2">
          <Text variant="caption1" color="tertiary" selectable>
            Created {bookmark.createdAt.toLocaleString()}
          </Text>
          {bookmark.modifiedAt &&
            bookmark.modifiedAt.getTime() !== bookmark.createdAt.getTime() && (
              <Text variant="caption1" color="tertiary" selectable>
                Modified {bookmark.modifiedAt.toLocaleString()}
              </Text>
            )}
        </View>
      </KeyboardAwareScrollView>
    </KeyboardGestureArea>
  );
};

export default ViewBookmarkPage;
