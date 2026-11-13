import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import QueryPageState from "@/components/QueryPageState";
import { AppIcon, SelectionIndicator } from "@/components/ui/AppIcon";
import EmptyState from "@/components/ui/EmptyState";
import { GroupedListRow } from "@/components/ui/GroupedList";
import { SearchInput } from "@/components/ui/SearchInput";
import { HeaderTextButton } from "@/components/ui/SheetHeader";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { i18n } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";
import { getBookmarkDisplayTitle, getDisplayHost } from "@/lib/bookmarkDisplay";
import { useColorScheme } from "@/lib/useColorScheme";
import useAppSettings from "@/lib/settings";
import { buildApiHeaders } from "@/lib/utils";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Globe, NotepadText, SearchX } from "lucide-react-native";

import {
  useAddBookmarkToList,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  BookmarkTypes,
  MAX_NUM_BOOKMARKS_PER_PAGE,
} from "@karakeep/shared/types/bookmarks";
import { getBookmarkLinkImageUrl } from "@karakeep/shared/utils/bookmarkUtils";

function subtitleFor(bookmark: ZBookmark) {
  return bookmark.content.type === BookmarkTypes.LINK
    ? getDisplayHost(bookmark.content.url)
    : bookmark.content.type === BookmarkTypes.TEXT
      ? i18n.t("add_to_list.type_note")
      : i18n.t("add_to_list.type_file");
}

function PickerThumbnail({ bookmark }: { bookmark: ZBookmark }) {
  const { colors } = useColorScheme();
  const { settings } = useAppSettings();
  const headers = buildApiHeaders(settings.apiKey, settings.customHeaders);
  const image =
    bookmark.content.type === BookmarkTypes.LINK
      ? getBookmarkLinkImageUrl(bookmark.content)
      : bookmark.content.type === BookmarkTypes.ASSET
        ? { url: `/api/assets/${bookmark.content.assetId}`, localAsset: true }
        : null;

  return (
    <View
      className="h-9 w-9 overflow-hidden rounded-md bg-background dark:bg-muted/20"
      style={{ borderCurve: "continuous" }}
    >
      {!image && (
        <View className="h-full w-full items-center justify-center">
          <AppIcon
            icon={
              bookmark.content.type === BookmarkTypes.TEXT ? NotepadText : Globe
            }
            size={17}
            color={colors.grey}
          />
        </View>
      )}
      {image && (
        <Image
          source={
            image.localAsset
              ? { uri: `${settings.address}${image.url}`, headers }
              : { uri: image.url }
          }
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      )}
    </View>
  );
}

export default function AddBookmarksToListPage() {
  const { slug: listId } = useLocalSearchParams<{ slug: string }>();
  const api = useTRPC();
  const { colors } = useColorScheme();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  // Reflects taps right away, ahead of the server round trip.
  const [changes, setChanges] = useState<Record<string, boolean>>({});

  const { data: list } = useQuery(api.lists.get.queryOptions({ listId }));
  const {
    data: members,
    error: membersError,
    isFetchNextPageError: membersPageFailed,
    refetch: refetchMembers,
    hasNextPage: hasMoreMembers,
    isFetchingNextPage: isFetchingMembers,
    fetchNextPage: fetchMoreMembers,
  } = useInfiniteQuery(
    api.bookmarks.getBookmarks.infiniteQueryOptions(
      {
        listId,
        limit: MAX_NUM_BOOKMARKS_PER_PAGE,
        includeContent: false,
        useCursorV2: true,
      },
      {
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );
  // Checkmarks need every member, or older ones would show as unchecked.
  useEffect(() => {
    if (hasMoreMembers && !isFetchingMembers && !membersPageFailed) {
      void fetchMoreMembers({ cancelRefetch: false });
    }
  }, [hasMoreMembers, isFetchingMembers, membersPageFailed, fetchMoreMembers]);
  const membersLoaded = !!members && !hasMoreMembers;
  const memberIds = useMemo(
    () =>
      new Set(
        members?.pages.flatMap((page) => page.bookmarks.map((b) => b.id)),
      ),
    [members],
  );

  const { data, error, refetch, fetchNextPage, hasNextPage, isFetching } =
    useInfiniteQuery(
      api.bookmarks.getBookmarks.infiniteQueryOptions(
        { archived: false, includeContent: false, useCursorV2: true },
        {
          initialCursor: null,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
      ),
    );

  const onError = () => {
    toast({
      message: t("add_to_list.update_failed"),
      variant: "destructive",
      showProgress: false,
    });
  };
  const { mutate: addToList } = useAddBookmarkToList({ onError });
  const { mutate: removeFromList } = useRemoveBookmarkFromList({ onError });

  const bookmarks = useMemo(() => {
    const all = data?.pages.flatMap((page) => page.bookmarks) ?? [];
    const needle = filter.trim().toLowerCase();
    return needle
      ? all.filter((b) =>
          `${getBookmarkDisplayTitle(b)} ${subtitleFor(b)}`
            .toLowerCase()
            .includes(needle),
        )
      : all;
  }, [data, filter]);

  // Without every member the checkmarks would be wrong, so a failure there
  // blocks the picker too.
  const pageError = error ?? (membersLoaded ? null : membersError);
  if (!data || pageError) {
    return (
      <QueryPageState
        error={pageError}
        onRetry={() => {
          void refetch();
          void refetchMembers();
        }}
      />
    );
  }

  const isInList = (id: string) => changes[id] ?? memberIds.has(id);

  const toggle = (id: string) => {
    if (!membersLoaded) {
      return;
    }
    void Haptics.selectionAsync();
    const next = !isInList(id);
    setChanges((prev) => ({ ...prev, [id]: next }));
    const revert = () => setChanges((prev) => ({ ...prev, [id]: !next }));
    if (next) {
      addToList({ bookmarkId: id, listId }, { onError: revert });
    } else {
      removeFromList({ bookmarkId: id, listId }, { onError: revert });
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: list
            ? t("add_to_list.title", { name: list.name })
            : t("lists.add_bookmarks"),
          headerRight: () => (
            <HeaderTextButton
              label={t("actions.done")}
              emphasized
              onPress={() => router.back()}
            />
          ),
        }}
      />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <SearchInput
            containerClassName="mb-3"
            placeholder={t("add_to_list.filter_placeholder")}
            value={filter}
            onChangeText={setFilter}
          />
        }
        data={bookmarks}
        keyExtractor={(b) => b.id}
        onEndReached={() => {
          if (hasNextPage && !isFetching) {
            void fetchNextPage({ cancelRefetch: false });
          }
        }}
        ListFooterComponent={
          isFetching ? (
            <View className="py-4">
              <ActivityIndicator />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon={SearchX}
            title={t("add_to_list.empty_title")}
            subtitle={
              filter.trim()
                ? t("add_to_list.empty_filtered_subtitle")
                : t("add_to_list.empty_subtitle")
            }
          />
        }
        renderItem={({ item, index }) => {
          const selected = membersLoaded && isInList(item.id);
          return (
            <GroupedListRow
              isFirst={index === 0}
              isLast={index === bookmarks.length - 1}
            >
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: selected,
                  disabled: !membersLoaded,
                }}
                disabled={!membersLoaded}
                onPress={() => toggle(item.id)}
                className="min-h-14 flex-row items-center gap-3 px-4 py-2 active:opacity-70"
              >
                <PickerThumbnail bookmark={item} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1}>{getBookmarkDisplayTitle(item)}</Text>
                  <Text variant="footnote" color="tertiary" numberOfLines={1}>
                    {subtitleFor(item)}
                  </Text>
                </View>
                <SelectionIndicator
                  selected={selected}
                  selectedColor={colors.primary}
                  color={colors.grey}
                />
              </Pressable>
            </GroupedListRow>
          );
        }}
      />
    </>
  );
}
