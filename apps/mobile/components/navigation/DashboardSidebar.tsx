import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  router,
  useGlobalSearchParams,
  useRootNavigationState,
  useSegments,
} from "expo-router";
import Logo from "@/components/Logo";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Text } from "@/components/ui/Text";
import { useServerVersion } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/hooks";
import { SIDEBAR_WIDTH } from "@/lib/responsive";
import { useColorScheme } from "@/lib/useColorScheme";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Highlighter,
  House,
  Plus,
  Search,
  Tag,
} from "lucide-react-native";

import type { ZBookmarkListTreeNode } from "@karakeep/shared/utils/listUtils";
import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";

const ICON_SIZE = 20;
// The disclosure chevron's column in the lists section. Rows without children
// keep it empty, so icons and counts line up.
const CHEVRON_SLOT_WIDTH = 20;
const LOGO_HEIGHT = 32;
const LOGO_WIDTH = Math.round((LOGO_HEIGHT * 598) / 166);

interface NavigationRoute {
  name: string;
  params?: { slug?: string; screen?: string };
  state?: { index?: number; routes: NavigationRoute[] };
}

/**
 * The sidebar entry a dashboard stack screen belongs to, if any: the tab
 * group for tabs (a tag belongs to Tags), the route name for Favourites and
 * Archive, and `lists/<id>` for a list.
 */
function entryKey(route: NavigationRoute) {
  switch (route.name) {
    case "(tabs)": {
      const tabs = route.state;
      return tabs ? tabs.routes[tabs.index ?? 0]?.name : route.params?.screen;
    }
    case "favourites":
    case "archive":
      return route.name;
    case "lists/[slug]/index":
      return `lists/${route.params?.slug}`;
    case "tags/[slug]":
      return "(tags)";
  }
  return undefined;
}

/**
 * Identifies the sidebar entry to highlight. That's the current screen when
 * it's an entry, which the URL tells reliably, even before the navigators
 * fill in their state. Screens opened from an entry (a bookmark, a sheet)
 * keep the topmost entry below them in the dashboard stack selected. Reading
 * that from the navigation state, rather than remembering it, keeps it right
 * when the sidebar remounts after folding.
 */
function useActiveKey() {
  const segments: string[] = useSegments();
  const { slug } = useGlobalSearchParams<{ slug?: string }>();
  const rootState = useRootNavigationState() as
    | NavigationRoute["state"]
    | undefined;

  if (segments[1] === "(tabs)") {
    return segments[2];
  }
  if (segments[1] === "favourites" || segments[1] === "archive") {
    return segments[1];
  }
  if (
    segments[1] === "lists" &&
    segments[2] === "[slug]" &&
    segments.length === 3
  ) {
    return `lists/${slug}`;
  }
  if (
    segments[1] === "tags" &&
    segments[2] === "[slug]" &&
    segments.length === 3
  ) {
    return "(tags)";
  }

  // Expo Router nests the app's navigators under its own root route.
  let dashboard: NavigationRoute["state"];
  for (let state = rootState; state && !dashboard;) {
    dashboard = state.routes.find((route) => route.name === "dashboard")?.state;
    state = state.routes[state.index ?? state.routes.length - 1]?.state;
  }
  if (!dashboard) {
    return undefined;
  }
  const top = dashboard.index ?? dashboard.routes.length - 1;
  for (let i = top; i >= 0; i--) {
    const key = entryKey(dashboard.routes[i]);
    if (key) {
      return key;
    }
  }
  return undefined;
}

/**
 * Shows a sidebar entry. Entries replace the content instead of stacking on
 * top of each other, so going back from a list returns to the tabs.
 */
function openEntry(href: string, isTab: boolean) {
  if (router.canDismiss()) {
    router.dismissAll();
  }
  if (isTab) {
    router.navigate(href);
  } else {
    router.push(href);
  }
}

/**
 * A sidebar row: an icon (or a list's emoji), the label, and an optional
 * count. `leading` sits before the row's own tap target, for the lists'
 * disclosure chevrons. Mirrors the web app's sidebar.
 */
function SidebarRow({
  label,
  icon: Icon,
  emoji,
  count,
  active,
  depth = 0,
  onPress,
  leading,
}: {
  label: string;
  icon?: LucideIcon;
  emoji?: string;
  count?: number;
  active: boolean;
  depth?: number;
  onPress: () => void;
  leading?: ReactNode;
}) {
  const { colors } = useColorScheme();
  return (
    <View
      className={cn(
        "flex-row items-center rounded-lg",
        active && "bg-muted/20",
      )}
      style={{ marginLeft: depth * 16, borderCurve: "continuous" }}
    >
      {leading}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className="min-h-10 flex-1 flex-row items-center gap-3 px-3 py-2"
      >
        {Icon ? (
          <Icon
            size={ICON_SIZE}
            color={active ? colors.foreground : colors.grey}
          />
        ) : (
          <Text numberOfLines={1} className="min-w-5 text-center text-lg">
            {emoji}
          </Text>
        )}
        <Text
          numberOfLines={1}
          className={cn(
            "flex-1 text-[15px]",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </Text>
        {count !== undefined && (
          <Text className="text-xs text-muted-foreground">{count}</Text>
        )}
      </Pressable>
    </View>
  );
}

function Disclosure({
  label,
  expanded,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useColorScheme();
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      hitSlop={8}
      className="items-center justify-center self-stretch"
      style={{ width: CHEVRON_SLOT_WIDTH }}
    >
      <Chevron size={14} color={colors.grey} />
    </Pressable>
  );
}

const EMPTY_DISCLOSURE = <View style={{ width: CHEVRON_SLOT_WIDTH }} />;

function byName(a: ZBookmarkListTreeNode, b: ZBookmarkListTreeNode) {
  return a.item.name.localeCompare(b.item.name);
}

/**
 * A list tree. Like on the web, a list opens while you're in it or in one of
 * its children, and can be opened or closed by hand from there. Those manual
 * toggles only last until you go somewhere else, so a list you open next is
 * never hidden inside a parent you closed earlier.
 */
function ListRows({
  nodes,
  depth,
  activeKey,
  openIds,
  stats,
}: {
  nodes: ZBookmarkListTreeNode[];
  depth: number;
  activeKey: string | undefined;
  openIds: Set<string>;
  stats: Map<string, number> | undefined;
}) {
  const [toggled, setToggled] = useState<{
    activeKey?: string;
    open: Record<string, boolean>;
  }>({ open: {} });
  const overrides = toggled.activeKey === activeKey ? toggled.open : {};

  return [...nodes].sort(byName).map((node) => {
    const hasChildren = node.children.length > 0;
    const isOpen = overrides[node.item.id] ?? openIds.has(node.item.id);
    return (
      <View key={node.item.id}>
        <SidebarRow
          label={node.item.name}
          emoji={node.item.icon}
          count={stats?.get(node.item.id)}
          depth={depth}
          active={activeKey === `lists/${node.item.id}`}
          onPress={() => openEntry(`/dashboard/lists/${node.item.id}`, false)}
          leading={
            hasChildren ? (
              <Disclosure
                label={node.item.name}
                expanded={isOpen}
                onToggle={() =>
                  setToggled({
                    activeKey,
                    open: { ...overrides, [node.item.id]: !isOpen },
                  })
                }
              />
            ) : (
              EMPTY_DISCLOSURE
            )
          }
        />
        {hasChildren && isOpen && (
          <ListRows
            nodes={node.children}
            depth={depth + 1}
            activeKey={activeKey}
            openIds={openIds}
            stats={stats}
          />
        )}
      </View>
    );
  });
}

/**
 * Navigation sidebar for wide windows, such as iPhone Duo's inner display and
 * iPads. It replaces the tab bar there, and follows the web app's sidebar:
 * the main pages, then your lists, then lists shared with you.
 */
export function DashboardSidebar() {
  const { colors } = useColorScheme();
  const { t } = useTranslation();
  const activeKey = useActiveKey();
  // Like the lists' own toggles, this only lasts until you go somewhere else.
  const [sharedToggled, setSharedToggled] = useState<{
    activeKey?: string;
    open: boolean;
  }>();

  const api = useTRPC();
  const { data: lists } = useBookmarkLists();
  const { data: listStats } = useQuery(api.lists.stats.queryOptions());
  const { data: serverVersion } = useServerVersion();

  const roots = Object.values(lists?.root ?? {});
  const ownedLists = roots.filter((node) => node.item.userRole === "owner");
  const sharedLists = roots.filter((node) => node.item.userRole !== "owner");

  const activeListId = activeKey?.startsWith("lists/")
    ? activeKey.slice("lists/".length)
    : undefined;
  const activePath = activeListId
    ? lists?.getPathById(activeListId)
    : undefined;
  const openIds = new Set(activePath?.map((list) => list.id));
  const sharedOpen =
    sharedToggled && sharedToggled.activeKey === activeKey
      ? sharedToggled.open
      : sharedLists.some((node) => openIds.has(node.item.id));

  return (
    <SafeAreaView
      edges={["top", "left", "bottom"]}
      style={{ width: SIDEBAR_WIDTH }}
      className="border-r border-border bg-card"
    >
      <View className="px-5 pb-4 pt-3">
        <TailwindResolver
          className="color-foreground"
          comp={(styles) => (
            <Logo
              height={LOGO_HEIGHT}
              width={LOGO_WIDTH}
              fill={styles?.color?.toString()}
            />
          )}
        />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <SidebarRow
          label={t("tabs.home")}
          icon={House}
          active={activeKey === "(home)"}
          onPress={() => openEntry("/dashboard/(home)", true)}
        />
        <SidebarRow
          label={t("tabs.search")}
          icon={Search}
          active={activeKey === "(search)"}
          onPress={() => openEntry("/dashboard/(search)", true)}
        />
        <SidebarRow
          label={t("tabs.tags")}
          icon={Tag}
          active={activeKey === "(tags)"}
          onPress={() => openEntry("/dashboard/(tags)", true)}
        />
        <SidebarRow
          label={t("tabs.highlights")}
          icon={Highlighter}
          active={activeKey === "(highlights)"}
          onPress={() => openEntry("/dashboard/(highlights)", true)}
        />
        <SidebarRow
          label={t("lists_tab.archive")}
          icon={Archive}
          active={activeKey === "archive"}
          onPress={() => openEntry("/dashboard/archive", false)}
        />

        <View className="my-4 h-px bg-border" />

        <View className="flex-row items-center justify-between pb-2 pl-3">
          <Text className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("tabs.lists")}
          </Text>
          <Pressable
            onPress={() => router.push("/dashboard/lists/new")}
            accessibilityRole="button"
            accessibilityLabel={t("lists_tab.new_list")}
            hitSlop={8}
            className="px-2"
          >
            <Plus size={18} strokeWidth={1.5} color={colors.grey} />
          </Pressable>
        </View>
        <SidebarRow
          label={t("lists.all_lists")}
          emoji="📋"
          active={activeKey === "(lists)"}
          onPress={() => openEntry("/dashboard/(lists)", true)}
          leading={EMPTY_DISCLOSURE}
        />
        <SidebarRow
          label={t("lists_tab.favourites")}
          emoji="⭐️"
          active={activeKey === "favourites"}
          onPress={() => openEntry("/dashboard/favourites", false)}
          leading={EMPTY_DISCLOSURE}
        />
        <ListRows
          nodes={ownedLists}
          depth={0}
          activeKey={activeKey}
          openIds={openIds}
          stats={listStats?.stats}
        />
        {sharedLists.length > 0 && (
          <>
            <SidebarRow
              label={t("lists_tab.shared_with_me")}
              emoji="👥"
              active={false}
              onPress={() => setSharedToggled({ activeKey, open: !sharedOpen })}
              leading={
                <Disclosure
                  label={t("lists_tab.shared_with_me")}
                  expanded={sharedOpen}
                  onToggle={() =>
                    setSharedToggled({ activeKey, open: !sharedOpen })
                  }
                />
              }
            />
            {sharedOpen && (
              <ListRows
                nodes={sharedLists}
                depth={1}
                activeKey={activeKey}
                openIds={openIds}
                stats={listStats?.stats}
              />
            )}
          </>
        )}
      </ScrollView>
      {serverVersion && (
        <View className="mx-2.5 border-t border-border px-3 py-3">
          <Text className="text-[15px] text-muted-foreground">
            Karakeep v{serverVersion}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
