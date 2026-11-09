import { useCallback, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Link, router, Stack, useFocusEffect } from "expo-router";
import { AppIcon } from "@/components/ui/AppIcon";
import { PendingListInvitations } from "@/components/lists/pending-list-invitations";
import QueryPageState from "@/components/QueryPageState";
import { ProfileAvatarButton } from "@/components/settings/ProfileAvatarButton";
import ChevronRight from "@/components/ui/ChevronRight";
import { FAB } from "@/components/ui/FAB";
import { GroupedHeader, GroupedListRow } from "@/components/ui/GroupedList";
import { Text } from "@/components/ui/Text";
import { useSharedTranslation, useTranslation } from "@/lib/i18n/hooks";
import {
  getOfflineLibraryScope,
  useOfflineLibrary,
} from "@/lib/offlineLibrary";
import { READABLE_CONTENT_MAX_WIDTH } from "@/lib/responsive";
import useAppSettings from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  Plus,
  Star,
  Users,
} from "lucide-react-native";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZBookmarkListTreeNode } from "@karakeep/shared/utils/listUtils";

const FAVOURITE_COLOR = "#ebb434";
const LEVEL_INDENT = 22;
// Where the name starts in a row: 16 padding + 24 icon + 12 gap.
const SEPARATOR_INSET = 52;

interface ListLink {
  id: string;
  logo?: React.ReactNode;
  emoji?: string;
  name: string;
  href?: string;
  level: number;
  numChildren: number;
  collapsed: boolean;
  count?: number;
  isSmart?: boolean;
}

type ListItem =
  | { kind: "header"; id: string; label: string }
  | ({ kind: "row"; isFirst: boolean; isLast: boolean } & ListLink);

function byName(a: ZBookmarkListTreeNode, b: ZBookmarkListTreeNode) {
  return a.item.name.localeCompare(b.item.name);
}

function traverseTree(
  node: ZBookmarkListTreeNode,
  links: ListLink[],
  collapsedLists: Record<string, boolean>,
  listStats?: Map<string, number>,
  level = 0,
) {
  links.push({
    id: node.item.id,
    emoji: node.item.icon,
    name: node.item.name,
    href: `/dashboard/lists/${node.item.id}`,
    level,
    numChildren: node.children?.length ?? 0,
    collapsed: !!collapsedLists[node.item.id],
    count: listStats ? (listStats.get(node.item.id) ?? 0) : undefined,
    isSmart: node.item.type === "smart",
  });

  if (node.children && !collapsedLists[node.item.id]) {
    [...node.children]
      .sort(byName)
      .forEach((child) =>
        traverseTree(child, links, collapsedLists, listStats, level + 1),
      );
  }
}

function toRows(links: ListLink[]): ListItem[] {
  return links.map((link, index) => ({
    kind: "row" as const,
    isFirst: index === 0,
    isLast: index === links.length - 1,
    ...link,
  }));
}

function ListRow({
  item,
  onToggle,
}: {
  item: Extract<ListItem, { kind: "row" }>;
  onToggle: (id: string) => void;
}) {
  const { colors } = useColorScheme();
  const { t } = useTranslation();
  const hasChildren = item.numChildren > 0;

  const content = (
    <Pressable
      accessibilityRole="button"
      onPress={item.href ? undefined : () => onToggle(item.id)}
      className="min-h-11 flex-row items-center gap-3 py-2.5 pr-4 active:opacity-70"
      style={{ paddingLeft: 16 + item.level * LEVEL_INDENT }}
    >
      <View className="w-6 items-center">
        {item.logo ?? (
          <Text className="text-[19px] leading-6">{item.emoji}</Text>
        )}
      </View>
      <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
        <Text className="shrink" numberOfLines={1}>
          {item.name}
        </Text>
        {item.isSmart && (
          <Text
            variant="caption2"
            className="rounded bg-background px-1 text-muted-foreground dark:bg-muted/25 dark:text-foreground/80"
          >
            {t("lists.type_smart")}
          </Text>
        )}
        {hasChildren && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              item.collapsed
                ? t("lists_tab.show_children", { name: item.name })
                : t("lists_tab.hide_children", { name: item.name })
            }
            hitSlop={12}
            className="pl-0.5"
            onPress={() => {
              void Haptics.selectionAsync();
              onToggle(item.id);
            }}
          >
            {item.collapsed ? (
              <AppIcon icon={ChevronDown} size={13} color={colors.primary} />
            ) : (
              <AppIcon icon={ChevronUp} size={13} color={colors.primary} />
            )}
          </Pressable>
        )}
      </View>
      {item.count !== undefined && (
        <Text variant="subhead" color="tertiary" className="tabular-nums">
          {item.count}
        </Text>
      )}
      {item.href && <ChevronRight size={18} />}
    </Pressable>
  );

  return (
    <GroupedListRow
      isFirst={item.isFirst}
      isLast={item.isLast}
      separatorInset={SEPARATOR_INSET}
    >
      {item.href ? (
        <Link asChild href={item.href}>
          {content}
        </Link>
      ) : (
        content
      )}
    </GroupedListRow>
  );
}

export default function Lists() {
  const { colors } = useColorScheme();
  const { t } = useTranslation();
  const { t: tShared } = useSharedTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const { data: lists, error, refetch } = useBookmarkLists();
  // Open by default, so a list you've just nested is easy to find.
  const [collapsedLists, setCollapsedLists] = useState<Record<string, boolean>>(
    {},
  );
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { data: listStats, refetch: refetchListStats } = useQuery(
    api.lists.stats.queryOptions(),
  );
  const { data: userStats, refetch: refetchUserStats } = useQuery(
    api.users.stats.queryOptions(),
  );
  useFocusEffect(
    useCallback(() => {
      void refetchListStats();
      void refetchUserStats();
    }, [refetchListStats, refetchUserStats]),
  );

  const { settings } = useAppSettings();
  const offlineLibrary = useOfflineLibrary(getOfflineLibraryScope(settings));

  const openNewList = () => {
    void Haptics.selectionAsync();
    router.push("/dashboard/lists/new");
  };

  const items = useMemo<ListItem[]>(() => {
    if (!lists) return [];

    const library: ListLink[] = [
      {
        id: "fav",
        logo: <AppIcon icon={Star} filled size={19} color={FAVOURITE_COLOR} />,
        name: t("lists_tab.favourites"),
        href: "/dashboard/favourites",
        level: 0,
        numChildren: 0,
        collapsed: false,
        count: userStats?.numFavorites,
      },
      {
        id: "arch",
        logo: <AppIcon icon={Archive} size={19} color={colors.icon} />,
        name: t("lists_tab.archive"),
        href: "/dashboard/archive",
        level: 0,
        numChildren: 0,
        collapsed: false,
        count: userStats?.numArchived,
      },
      {
        id: "downloads",
        logo: <AppIcon icon={ArrowDownToLine} size={19} color={colors.icon} />,
        name: t("headers.downloads"),
        href: "/dashboard/settings/offline-articles",
        level: 0,
        numChildren: 0,
        collapsed: false,
        count: offlineLibrary.length,
      },
    ];

    const owned: ListLink[] = [];
    Object.values(lists.root)
      .filter((list) => list.item.userRole === "owner")
      .sort(byName)
      .forEach((list) =>
        traverseTree(list, owned, collapsedLists, listStats?.stats),
      );

    const shared: ListLink[] = [];
    const sharedRoots = Object.values(lists.root)
      .filter((list) => list.item.userRole !== "owner")
      .sort(byName);
    if (sharedRoots.length > 0) {
      shared.push({
        id: "shared-section",
        logo: <AppIcon icon={Users} size={19} color={colors.icon} />,
        name: t("lists_tab.shared_with_me"),
        level: 0,
        numChildren: sharedRoots.length,
        collapsed: !!collapsedLists["shared-section"],
      });
      if (!collapsedLists["shared-section"]) {
        sharedRoots.forEach((list) =>
          traverseTree(list, shared, collapsedLists, listStats?.stats, 1),
        );
      }
    }

    return [
      ...toRows(library),
      ...(shared.length > 0
        ? [
            {
              kind: "header" as const,
              id: "h-shared",
              label: tShared("lists.shared"),
            },
            ...toRows(shared),
          ]
        : []),
      {
        kind: "header" as const,
        id: "h-owned",
        label: t("lists_tab.my_lists"),
      },
      ...toRows(owned),
    ];
  }, [
    lists,
    listStats,
    userStats,
    collapsedLists,
    colors.grey,
    colors.icon,
    offlineLibrary.length,
    t,
    tShared,
  ]);

  if (!lists) {
    return <QueryPageState error={error} onRetry={() => refetch()} />;
  }

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries(api.lists.list.pathFilter()),
        queryClient.invalidateQueries(api.lists.stats.pathFilter()),
        queryClient.invalidateQueries(api.users.stats.pathFilter()),
        queryClient.invalidateQueries(
          api.lists.getPendingInvitations.pathFilter(),
        ),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      {Platform.OS === "ios" && (
        <Stack.Screen
          options={{
            headerRight: () => (
              <View className="flex-row items-center gap-3 px-1">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("lists_tab.new_list")}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center active:opacity-60"
                  onPress={openNewList}
                >
                  <AppIcon icon={Plus} size={21} color={colors.foreground} />
                </Pressable>
                <ProfileAvatarButton />
              </View>
            ),
          }}
        />
      )}
      <FlatList
        ListHeaderComponent={PendingListInvitations}
        className="h-full"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingBottom: Platform.OS === "android" ? 96 : 32,
          paddingHorizontal: 16,
          width: "100%",
          maxWidth: READABLE_CONTENT_MAX_WIDTH,
          alignSelf: "center",
        }}
        renderItem={({ item }) =>
          item.kind === "header" ? (
            <View className="pb-1.5 pt-6">
              <GroupedHeader label={item.label} />
            </View>
          ) : (
            <ListRow
              item={item}
              onToggle={(id) =>
                setCollapsedLists((prev) => ({ ...prev, [id]: !prev[id] }))
              }
            />
          )
        }
        data={items}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
      {Platform.OS === "android" && (
        <FAB>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("lists_tab.new_list")}
            className="h-full w-full items-center justify-center"
            onPress={openNewList}
          >
            <Plus size={24} color="white" />
          </Pressable>
        </FAB>
      )}
    </>
  );
}
