import React from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Switch,
  TextInput,
  View,
  Platform,
} from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardGestureArea,
} from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { AppIcon } from "@/components/ui/AppIcon";
import AttachmentBox from "@/components/bookmarks/AttachmentBox";
import BookmarkTextMarkdown from "@/components/bookmarks/BookmarkTextMarkdown";
import { useOfflineAvailability } from "@/components/bookmarks/useOfflineAvailability";
import TagPill from "@/components/bookmarks/TagPill";
import QueryPageState from "@/components/QueryPageState";
import ChevronRight from "@/components/ui/ChevronRight";
import {
  GroupedSection,
  NavigationRow,
  RowSeparator,
} from "@/components/ui/GroupedList";
import { useDiscardGuard } from "@/components/ui/SheetHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { getIntlLocale } from "@/lib/i18n";
import {
  useCommonActions,
  useCommonStrings,
  useTranslation,
} from "@/lib/i18n/hooks";
import { shareBookmark } from "@/lib/shareBookmark";
import useAppSettings from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";
import {
  Archive,
  ArrowDownToLine,
  ChevronUp,
  PenLine,
  RefreshCw,
  ShareIcon,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react-native";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@karakeep/shared-react/trpc";

import {
  useAutoRefreshingBookmarkQuery,
  useDeleteBookmark,
  useSummarizeBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { isBookmarkStillTagging } from "@karakeep/shared/utils/bookmarkUtils";

// Date and time in the app language, e.g. "Nov 8, 2026" and "3:04 PM".
function formatTimestamp(date: Date) {
  const locale = getIntlLocale();
  return {
    date: date.toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: date.toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

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
  const { t } = useTranslation();
  const { colors } = useColorScheme();
  return (
    <GroupedSection header={t("bookmarks.title_section")}>
      <TextInput
        editable={!isPending && !disabled}
        placeholder={t("bookmarks.add_title_placeholder")}
        // A single line opens scrolled to its end on Android, hiding the start.
        multiline
        submitBehavior="blurAndSubmit"
        scrollEnabled={false}
        placeholderTextColor={colors.grey}
        selectionColor={Platform.OS === "ios" ? colors.primary : undefined}
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
  const { t } = useTranslation();
  const { colors } = useColorScheme();
  return (
    <GroupedSection header={t("bookmarks.notes_section")}>
      <TextInput
        editable={!isPending && !disabled}
        multiline
        placeholder={t("bookmarks.notes_placeholder")}
        placeholderTextColor={colors.grey}
        selectionColor={Platform.OS === "ios" ? colors.primary : undefined}
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
  const { t } = useTranslation();
  const hasTags = bookmark.tags.length > 0;
  const isTagging = isBookmarkStillTagging(bookmark);

  if (!isTagging && !hasTags && readOnly) {
    return null;
  }

  return (
    <GroupedSection header={t("bookmarks.organize_section")}>
      {isTagging ? (
        <View className="gap-3 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </View>
      ) : (
        hasTags && (
          <>
            <View className="flex-row flex-wrap gap-2 px-4 py-3">
              {bookmark.tags.map((tag) => (
                <TagPill key={tag.id} tag={tag} clickable={!readOnly} />
              ))}
            </View>
            {!readOnly && <RowSeparator />}
          </>
        )
      )}
      {!readOnly && (
        <>
          <NavigationRow
            label={t("bookmarks.manage_tags")}
            onPress={() =>
              router.push(`/dashboard/bookmarks/${bookmark.id}/manage_tags`)
            }
          />
          <RowSeparator />
          <ManageListsRow bookmark={bookmark} />
        </>
      )}
    </GroupedSection>
  );
}

function ManageListsRow({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
  const api = useTRPC();
  const { data } = useQuery(
    api.lists.getListsOfBookmark.queryOptions({ bookmarkId: bookmark.id }),
  );
  const names = data
    ? data.lists.map((list) => list.name).join(", ") ||
      t("bookmarks.lists_none")
    : undefined;

  return (
    <NavigationRow
      label={t("bookmarks.manage_lists")}
      value={names}
      onPress={() =>
        router.push(`/dashboard/bookmarks/${bookmark.id}/manage_lists`)
      }
    />
  );
}

function AISummarySection({
  bookmark,
  readOnly,
}: {
  bookmark: ZBookmark;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { colors } = useColorScheme();
  const [isExpanded, setIsExpanded] = React.useState(false);

  const { mutate: summarize, isPending: isSummarizing } = useSummarizeBookmark({
    onError: () => {
      toast({
        message: t("bookmarks.summarize_failed_ai"),
        variant: "destructive",
        showProgress: false,
      });
    },
  });

  const { mutate: resummarize, isPending: isResummarizing } =
    useSummarizeBookmark({
      onSuccess: () => {
        toast({ message: t("bookmarks.summary_updated"), showProgress: false });
      },
      onError: () => {
        toast({
          message: t("bookmarks.failed_regenerate_summary"),
          showProgress: false,
        });
      },
    });

  const { mutate: updateBookmark, isPending: isDeletingSummary } =
    useUpdateBookmark({
      onError: () => {
        toast({
          message: t("bookmarks.failed_delete_summary"),
          showProgress: false,
        });
      },
    });

  // Unknown bookmarks carry no content relation, so there is nothing to
  // summarize and the action would always fail.
  if (bookmark.content.type === BookmarkTypes.UNKNOWN) {
    return null;
  }

  if (bookmark.summary) {
    return (
      <GroupedSection header={t("bookmarks.ai_summary")}>
        <Pressable
          onPress={() => setIsExpanded(!isExpanded)}
          className="px-4 py-3"
        >
          <View className={isExpanded ? "" : "max-h-16 overflow-hidden"}>
            <BookmarkTextMarkdown text={bookmark.summary} size="subhead" />
          </View>
          {!isExpanded && (
            <Text variant="footnote" className="mt-1.5 text-primary">
              {t("bookmarks.show_more")}
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
            <Text className="text-primary">{t("bookmarks.generating")}</Text>
          </>
        ) : (
          <>
            <AppIcon icon={Sparkles} size={16} color={colors.primary} />
            <Text className="text-primary">
              {t("bookmarks.summarize_with_ai")}
            </Text>
          </>
        )}
      </Pressable>
    </GroupedSection>
  );
}

function BookmarkActionsSection({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
  const strings = useCommonStrings();
  const { toast } = useToast();
  const { settings } = useAppSettings();
  const { colors } = useColorScheme();

  const onError = () => {
    toast({
      message: strings.somethingWentWrong,
      variant: "destructive",
      showProgress: false,
    });
  };

  const { mutate: favoriteBookmark, variables: favoriteVariables } =
    useUpdateBookmark({
      onError,
    });

  const { mutate: archiveBookmark, isPending: isArchivePending } =
    useUpdateBookmark({
      onError,
    });

  const isFavourited =
    favoriteVariables?.bookmarkId === bookmark.id
      ? favoriteVariables.favourited
      : bookmark.favourited;

  const actionIconColor = colors.icon;
  const offline = useOfflineAvailability(bookmark.id);

  return (
    <>
      <GroupedSection>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            favoriteBookmark({
              bookmarkId: bookmark.id,
              favourited: !isFavourited,
            });
          }}
          className="flex-row items-center justify-between px-4 py-3 active:opacity-70"
        >
          <View className="flex-1 flex-row items-center gap-3">
            <AppIcon
              icon={Star}
              size={19}
              filled={isFavourited}
              color={isFavourited ? "#ebb434" : actionIconColor}
            />
            <Text className="flex-1" numberOfLines={1}>
              {t("bookmarks.favourited")}
            </Text>
          </View>
          <Switch
            className="shrink-0"
            value={isFavourited}
            onValueChange={(value) => {
              Haptics.selectionAsync();
              favoriteBookmark({
                bookmarkId: bookmark.id,
                favourited: value,
              });
            }}
          />
        </Pressable>
        <RowSeparator />
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            archiveBookmark({
              bookmarkId: bookmark.id,
              archived: !bookmark.archived,
            });
          }}
          disabled={isArchivePending}
          className="flex-row items-center justify-between px-4 py-3 active:opacity-70"
        >
          <View className="flex-1 flex-row items-center gap-3">
            <AppIcon icon={Archive} size={19} color={actionIconColor} />
            <Text className="flex-1" numberOfLines={1}>
              {t("bookmarks.archived")}
            </Text>
          </View>
          {isArchivePending ? (
            <ActivityIndicator size="small" />
          ) : (
            <Switch
              className="shrink-0"
              value={bookmark.archived}
              onValueChange={(value) => {
                Haptics.selectionAsync();
                archiveBookmark({
                  bookmarkId: bookmark.id,
                  archived: value,
                });
              }}
            />
          )}
        </Pressable>
        <RowSeparator />
        {bookmark.content.type === BookmarkTypes.LINK && (
          <>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                router.push(`/dashboard/bookmarks/${bookmark.id}/highlights`);
              }}
              className="flex-row items-center justify-between gap-3 px-4 py-3 active:opacity-70"
            >
              <View className="flex-1 flex-row items-center gap-3">
                <AppIcon icon={PenLine} size={19} color={actionIconColor} />
                <Text className="flex-1" numberOfLines={1}>
                  {t("headers.highlights")}
                </Text>
              </View>
              <ChevronRight size={16} />
            </Pressable>
            <RowSeparator />
          </>
        )}
        {(bookmark.content.type === BookmarkTypes.LINK ||
          bookmark.content.type === BookmarkTypes.TEXT) && (
          <>
            <View className="flex-row items-center justify-between px-4 py-2.5">
              <View className="flex-1 flex-row items-center gap-3">
                <AppIcon
                  icon={ArrowDownToLine}
                  size={19}
                  color={actionIconColor}
                />
                <Text className="flex-1" numberOfLines={1}>
                  {t("bookmarks.downloaded")}
                </Text>
              </View>
              {offline.isSaving ? (
                <ActivityIndicator size="small" />
              ) : (
                <Switch
                  className="shrink-0"
                  value={offline.isAvailableOffline}
                  onValueChange={(value) => {
                    void Haptics.selectionAsync();
                    if (value) {
                      void offline.save();
                    } else {
                      offline.confirmRemove();
                    }
                  }}
                />
              )}
            </View>
          </>
        )}
      </GroupedSection>
      <GroupedSection>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            shareBookmark(bookmark, settings, toast);
          }}
          className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
        >
          <AppIcon icon={ShareIcon} size={19} color={actionIconColor} />
          <Text numberOfLines={1}>{t("bookmark_actions.share")}</Text>
        </Pressable>
      </GroupedSection>
    </>
  );
}

// --- Main Page ---

const ViewBookmarkPage = () => {
  const headerHeight = useHeaderHeight();
  const { slug } = useLocalSearchParams();
  const { t } = useTranslation();
  const actions = useCommonActions();
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
  const allowLeave = useDiscardGuard(hasChanges);

  const { mutate: editBookmark, isPending: isEditPending } = useUpdateBookmark({
    onSuccess: () => {
      toast({ message: t("bookmarks.saved_toast"), showProgress: false });
      allowLeave();
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/dashboard/(home)");
      }
    },
    onError: () => {
      toast({
        message: t("bookmarks.failed_save_changes"),
        showProgress: false,
      });
    },
  });

  const { mutate: deleteBookmark, isPending: isDeletionPending } =
    useDeleteBookmark({
      onSuccess: () => {
        allowLeave();
        router.replace("/dashboard/(home)");
        toast({
          message: t("bookmarks.bookmark_deleted_toast"),
          showProgress: false,
        });
      },
    });

  const {
    data: bookmark,
    error,
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
        router.replace("/dashboard/(home)");
      }
    };

    if (hasChanges && bookmark) {
      editBookmark({ bookmarkId: bookmark.id, ...editedBookmark });
    } else {
      dismiss();
    }
  };

  if (!bookmark) {
    return <QueryPageState error={error} onRetry={() => refetch()} />;
  }

  const handleDeleteBookmark = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t("bookmark_actions.delete_this_title"),
      t("bookmark_actions.delete_permanent_message"),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: t("bookmark_actions.delete"),
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
          headerTitle: t("headers.edit_details"),
          headerRight: () => (
            <Pressable
              onPress={onDone}
              disabled={isEditPending}
              className="px-2"
            >
              {isEditPending ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text
                  className={
                    hasChanges ? "font-semibold text-primary" : "text-primary"
                  }
                >
                  {hasChanges ? actions.save : t("bookmarks.done")}
                </Text>
              )}
            </Pressable>
          ),
        }}
      />
      <KeyboardAwareScrollView
        bottomOffset={8}
        keyboardDismissMode="interactive"
        contentContainerStyle={{
          padding: 16,
          gap: 20,
          paddingBottom: 40 + headerHeight,
        }}
      >
        <TitleEditor
          title={title}
          setTitle={(newTitle) =>
            setEditedBookmark((prev) => ({ ...prev, title: newTitle }))
          }
          isPending={isEditPending}
          disabled={!isOwner}
        />
        <AISummarySection bookmark={bookmark} readOnly={!isOwner} />
        <TagList bookmark={bookmark} readOnly={!isOwner} />
        <NotesEditor
          notes={bookmark.note}
          setNotes={(note) =>
            setEditedBookmark((prev) => ({ ...prev, note: note ?? "" }))
          }
          isPending={isEditPending}
          disabled={!isOwner}
        />
        {isOwner && <BookmarkActionsSection bookmark={bookmark} />}
        <AttachmentBox bookmark={bookmark} />
        {isOwner && (
          <GroupedSection>
            <Pressable
              onPress={handleDeleteBookmark}
              disabled={isDeletionPending}
              className="items-center px-4 py-3 active:opacity-70"
            >
              <Text className="text-destructive" numberOfLines={1}>
                {isDeletionPending
                  ? t("bookmarks.deleting")
                  : t("bookmarks.delete_bookmark")}
              </Text>
            </Pressable>
          </GroupedSection>
        )}
        <View className="items-center gap-1 pt-2">
          <Text variant="caption1" color="tertiary" selectable>
            {t("bookmarks.saved_at", formatTimestamp(bookmark.createdAt))}
          </Text>
          {bookmark.modifiedAt &&
            bookmark.modifiedAt.getTime() !== bookmark.createdAt.getTime() && (
              <Text variant="caption1" color="tertiary" selectable>
                {t("bookmarks.edited_at", formatTimestamp(bookmark.modifiedAt))}
              </Text>
            )}
        </View>
      </KeyboardAwareScrollView>
    </KeyboardGestureArea>
  );
};

export default ViewBookmarkPage;
