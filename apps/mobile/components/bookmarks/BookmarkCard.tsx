import { AppIcon } from "@/components/ui/AppIcon";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import { buildApiHeaders } from "@/lib/utils";
import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import { useQuery } from "@tanstack/react-query";
import { isAfter, subYears } from "date-fns";
import type { ImageSource } from "expo-image";
import { Image } from "expo-image";
import type { Href } from "expo-router";
import { Link, useRouter } from "expo-router";
import { useRef, useState } from "react";
import type { ComponentProps } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import * as Haptics from "expo-haptics";
import type { MenuAction } from "@react-native-menu/menu";
import type { LucideIcon } from "lucide-react-native";
import { Archive, ArrowDownToLine, Globe, Star } from "lucide-react-native";
import {
  getBookmarkDisplayTitle,
  getDisplayHost,
  getNoteBody,
} from "@/lib/bookmarkDisplay";
import { useColorScheme } from "@/lib/useColorScheme";

import { useTRPC } from "@karakeep/shared-react/trpc";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkLinkImageUrl,
  getBookmarkRefreshInterval,
} from "@karakeep/shared/utils/bookmarkUtils";

import { getIntlLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";
import { useToast } from "../ui/Toast";
import BookmarkAssetImage from "./BookmarkAssetImage";
import BookmarkTextMarkdown from "./BookmarkTextMarkdown";
import {
  BookmarkCardContainer,
  BookmarkCardContext,
} from "./card/BookmarkCard";
import TagList from "./card/TagList";
import ActionBar from "./card/ActionBar";
import type { BookmarkActionController } from "./card/use-bookmark-actions";
import { useBookmarkActions } from "./card/use-bookmark-actions";

function BookmarkFooterMetadata({ ctx }: { ctx: BookmarkCardContext }) {
  const { colors } = useColorScheme();
  const { t } = useTranslation();
  const oneYearAgo = subYears(new Date(), 1);
  // Intl puts the day and month in each language's own order ("Nov 8", "8 lis").
  const dateLabel = ctx.bookmark.createdAt.toLocaleDateString(getIntlLocale(), {
    month: "short",
    day: "numeric",
    year: isAfter(ctx.bookmark.createdAt, oneYearAgo) ? undefined : "numeric",
  });

  return (
    <View className="min-w-0 flex-row items-center gap-1">
      {ctx.footerExtras && (
        <>
          <BookmarkCardContainer.FooterExtras />
          <Text variant="footnote" color="tertiary" className="shrink-0">
            ·
          </Text>
        </>
      )}
      <Text
        variant="footnote"
        color="tertiary"
        className="shrink-0"
        numberOfLines={1}
      >
        {dateLabel}
      </Text>
      {ctx.bookmark.archived && (
        <AppIcon
          icon={Archive}
          size={12}
          color={colors.grey}
          accessibilityLabel={t("bookmarks.archived")}
        />
      )}
      {ctx.actions.isAvailableOffline && (
        <AppIcon
          icon={ArrowDownToLine}
          size={12}
          color={colors.grey}
          accessibilityLabel={t("bookmark_actions.available_offline")}
        />
      )}
    </View>
  );
}

/** Wide images fill the card; logos and portraits fit, so nothing gets cut off. */
function ExpandedLinkImage({ source }: { source: ImageSource }) {
  const [fits, setFits] = useState(false);
  return (
    <View className="h-44 w-full bg-background dark:bg-muted/20">
      <Image
        source={source}
        style={{ width: "100%", height: "100%" }}
        contentFit={fits ? "contain" : "cover"}
        onLoad={({ source: { width, height } }) => {
          setFits(width / height < 1.3);
        }}
      />
    </View>
  );
}

function LinkPlaceholder({ iconSize }: { iconSize: number }) {
  const { colors } = useColorScheme();
  return (
    <View className="h-full w-full items-center justify-center bg-background dark:bg-muted/20">
      <AppIcon icon={Globe} size={iconSize} color={colors.grey} />
    </View>
  );
}

function useLinkCardContext({
  bookmark,
}: {
  bookmark: ZBookmark;
}): Omit<BookmarkCardContext, "isOwner" | "bookmark" | "actions"> | undefined {
  const { settings } = useAppSettings();

  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return undefined;
  }

  const imageUrl = getBookmarkLinkImageUrl(bookmark.content);
  const source = imageUrl
    ? imageUrl.localAsset
      ? {
          uri: `${settings.address}${imageUrl.url}`,
          headers: buildApiHeaders(settings.apiKey, settings.customHeaders),
        }
      : { uri: imageUrl.url }
    : undefined;

  return {
    // A page with no image just leads with its title in the expanded layout.
    media: source ? <ExpandedLinkImage source={source} /> : undefined,
    compactMedia: (
      <View
        className="h-[72px] w-[72px] overflow-hidden rounded-lg"
        style={{ borderCurve: "continuous" }}
      >
        {source ? (
          <Image
            source={source}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <LinkPlaceholder iconSize={24} />
        )}
      </View>
    ),
    title: getBookmarkDisplayTitle(bookmark),
    footerExtras: (
      <Text
        variant="footnote"
        color="tertiary"
        className="shrink"
        numberOfLines={1}
      >
        {getDisplayHost(bookmark.content.url)}
      </Text>
    ),
  };
}

function useTextCardContext({
  bookmark,
}: {
  bookmark: ZBookmark;
}): Omit<BookmarkCardContext, "isOwner" | "bookmark" | "actions"> | undefined {
  if (bookmark.content.type !== BookmarkTypes.TEXT) {
    return undefined;
  }
  const body = getNoteBody(bookmark);

  return {
    body: body ? (
      <View className="max-h-40 overflow-hidden text-foreground">
        <BookmarkTextMarkdown text={body} size="subhead" muted />
      </View>
    ) : undefined,
    compactBody: body ? (
      <Text variant="subhead" color="tertiary" numberOfLines={2}>
        {body}
      </Text>
    ) : undefined,
    title: getBookmarkDisplayTitle(bookmark),
  };
}

function useAssetCardContext({
  bookmark,
}: {
  bookmark: ZBookmark;
}): Omit<BookmarkCardContext, "isOwner" | "bookmark" | "actions"> | undefined {
  if (bookmark.content.type !== BookmarkTypes.ASSET) {
    return undefined;
  }
  const assetImage =
    bookmark.assets.find((r) => r.assetType == "assetScreenshot")?.id ??
    bookmark.content.assetId;

  return {
    media: <BookmarkAssetImage assetId={assetImage} className="h-44 w-full" />,
    compactMedia: (
      <BookmarkAssetImage
        assetId={assetImage}
        className="h-[72px] w-[72px] overflow-hidden rounded-lg bg-background dark:bg-muted/20"
      />
    ),
    title: getBookmarkDisplayTitle(bookmark),
  };
}

// Keeps the last lines of a card clear of the actions pinned to its corner.
const ACTIONS_CLEARANCE = 60;

function CardActions({
  actions,
  compact,
  itemName,
}: {
  actions: BookmarkActionController;
  compact?: boolean;
  itemName?: string;
}) {
  return (
    <View className="absolute bottom-3 right-3">
      <ActionBar actions={actions} compact={compact} itemName={itemName} />
    </View>
  );
}

function CardLayout({ ctx }: { ctx: BookmarkCardContext }) {
  return (
    <BookmarkCardContainer.Provider value={ctx}>
      <BookmarkCardContainer.Media />
      <View className="gap-2 p-3">
        <View className="gap-0.5">
          <BookmarkCardContainer.Title />
          <BookmarkFooterMetadata ctx={ctx} />
        </View>
        <BookmarkCardContainer.Body />
        <BookmarkCardContainer.NoteSection />
        <View
          className="min-h-[22px] justify-center"
          style={{ paddingRight: ACTIONS_CLEARANCE + 24 }}
        >
          <TagList bookmark={ctx.bookmark} maxVisible={3} />
        </View>
      </View>
    </BookmarkCardContainer.Provider>
  );
}

function ListLayout({ ctx }: { ctx: BookmarkCardContext }) {
  const hasCompactMedia = Boolean(ctx.compactMedia ?? ctx.media);
  const { settings } = useAppSettings();
  const showsNote = settings.showNotes && Boolean(ctx.bookmark.note?.trim());
  const hasRowBelowMeta =
    ctx.bookmark.tags.length > 0 || Boolean(ctx.compactBody) || showsNote;

  return (
    <BookmarkCardContainer.Provider value={ctx}>
      <View className="flex-row gap-3 p-3">
        {hasCompactMedia && (
          <View className="justify-start">
            <BookmarkCardContainer.CompactMedia />
          </View>
        )}
        <View className="min-w-0 flex-1 gap-1">
          {ctx.title && (
            <Text
              className="text-[15px] font-semibold leading-5 text-foreground"
              numberOfLines={2}
            >
              {ctx.title}
            </Text>
          )}
          <View
            style={{ paddingRight: hasRowBelowMeta ? 0 : ACTIONS_CLEARANCE }}
          >
            <BookmarkFooterMetadata ctx={ctx} />
          </View>
          <BookmarkCardContainer.CompactBody />
          <BookmarkCardContainer.NoteSection />
          {/* Text would otherwise run under the actions pinned to the corner. */}
          {hasRowBelowMeta && (
            <View
              style={{ paddingRight: ACTIONS_CLEARANCE, minHeight: 22 }}
              className="mt-0.5 justify-center"
            >
              <TagList bookmark={ctx.bookmark} />
            </View>
          )}
        </View>
      </View>
    </BookmarkCardContainer.Provider>
  );
}

const SWIPE_ACTION_WIDTH = 84;
const SWIPE_TAP_GUARD_MS = 700;

function SwipeAction({
  icon: Icon,
  label,
  className,
  align,
}: {
  icon: LucideIcon;
  label: string;
  className: string;
  align: "start" | "end";
}) {
  return (
    <View
      className={`h-full justify-center ${className} ${align === "start" ? "mr-2 items-start pl-5" : "ml-2 items-end pr-5"}`}
      style={{
        width: SWIPE_ACTION_WIDTH,
        borderRadius: 12,
        borderCurve: "continuous",
      }}
    >
      <AppIcon icon={Icon} size={20} color="white" />
      <Text variant="caption1" className="mt-0.5 font-medium text-white">
        {label}
      </Text>
    </View>
  );
}

/**
 * Native context-menu items, keeping submenus and destructive grouping. This
 * returns elements rather than being a component because Link.Menu only accepts
 * Link.MenuAction and Link.Menu as direct children.
 */
function renderContextMenuItems(
  items: MenuAction[],
  onSelect: (id: string) => void,
): React.ReactNode {
  return items.map((item) =>
    item.subactions?.length ? (
      <Link.Menu
        key={item.id}
        title={item.title}
        icon={item.image as ComponentProps<typeof Link.Menu>["icon"]}
      >
        {renderContextMenuItems(item.subactions, onSelect)}
      </Link.Menu>
    ) : (
      <Link.MenuAction
        key={item.id}
        icon={item.image as ComponentProps<typeof Link.MenuAction>["icon"]}
        destructive={item.attributes?.destructive}
        disabled={item.attributes?.disabled}
        onPress={() => {
          if (item.id) {
            onSelect(item.id);
          }
        }}
      >
        {item.title}
      </Link.MenuAction>
    ),
  );
}

/**
 * Swipe to favourite or archive, press and hold for everything else. Triage is
 * the main thing people do in a feed, so it shouldn't need a screen change.
 *
 * Card controls are siblings of the press target rather than children: a tap on
 * a control nested in a pressable card opens the bookmark instead.
 */
function CardGestures({
  actions,
  label,
  href,
  onOpen,
  overlay,
  children,
}: {
  actions: BookmarkActionController;
  label?: string;
  href: Href;
  onOpen?: () => void;
  overlay: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const swipeableRef = useRef<SwipeableMethods>(null);
  // Lifting a finger at the end of a swipe can still register as a press.
  const lastSwipeAt = useRef(0);
  const markSwiping = () => {
    lastSwipeAt.current = Date.now();
  };

  const pressable = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        if (Date.now() - lastSwipeAt.current >= SWIPE_TAP_GUARD_MS) {
          onOpen?.();
        }
      }}
    >
      {children}
    </Pressable>
  );

  const card = (
    <BookmarkCardContainer.Root>
      {Platform.OS === "ios" ? (
        <Link
          href={href}
          asChild
          // External-browser users leave the app instead of pushing the reader.
          onPress={(event) => {
            if (Date.now() - lastSwipeAt.current < SWIPE_TAP_GUARD_MS) {
              event.preventDefault();
            } else if (onOpen) {
              event.preventDefault();
              onOpen();
            }
          }}
        >
          <Link.Trigger>
            <Pressable accessibilityRole="button" accessibilityLabel={label}>
              {children}
            </Pressable>
          </Link.Trigger>
          <Link.Menu>
            {renderContextMenuItems(
              actions.contextMenuActions,
              actions.handleAction,
            )}
          </Link.Menu>
        </Link>
      ) : (
        pressable
      )}
      {overlay}
    </BookmarkCardContainer.Root>
  );

  if (!actions.isOwner) {
    return card;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={1.6}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={SWIPE_ACTION_WIDTH / 2}
      rightThreshold={SWIPE_ACTION_WIDTH / 2}
      renderLeftActions={() => (
        <SwipeAction
          icon={Star}
          label={
            actions.isFavourited
              ? t("bookmark_actions.swipe_unstar")
              : t("bookmark_actions.swipe_star")
          }
          className="bg-[#d9a21f]"
          align="start"
        />
      )}
      renderRightActions={() => (
        <SwipeAction
          icon={Archive}
          label={
            actions.isArchived
              ? t("bookmark_actions.swipe_restore")
              : t("bookmark_actions.archive")
          }
          className="bg-primary"
          align="end"
        />
      )}
      onSwipeableOpenStartDrag={markSwiping}
      onSwipeableCloseStartDrag={markSwiping}
      onSwipeableWillOpen={markSwiping}
      onSwipeableOpen={(direction) => {
        void Haptics.selectionAsync();
        // "left" means the row moved left, revealing the trailing action.
        if (direction === "left") {
          actions.toggleArchived();
        } else {
          actions.toggleFavourite();
        }
        swipeableRef.current?.close();
      }}
    >
      {card}
    </ReanimatedSwipeable>
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
  const { settings } = useAppSettings();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { data: currentUser } = useWhoAmI();

  const opensExternally =
    bookmark.content.type === BookmarkTypes.LINK &&
    settings.defaultBookmarkView === "externalBrowser";

  const openExternally = () => {
    if (bookmark.content.type !== BookmarkTypes.LINK) {
      return;
    }
    void Linking.openURL(bookmark.content.url).catch(() => {
      toast({
        message: t("bookmarks.couldnt_open_link"),
        variant: "destructive",
        showProgress: false,
      });
      router.push(`/dashboard/bookmarks/${bookmark.id}`);
    });
  };

  const linkContext = useLinkCardContext({ bookmark });
  const textContext = useTextCardContext({ bookmark });
  const assetContext = useAssetCardContext({ bookmark });
  const ctx = linkContext ?? textContext ?? assetContext;
  const Layout = settings.bookmarkLayout === "list" ? ListLayout : CardLayout;
  const isOwner = currentUser?.id === bookmark.userId;
  const actions = useBookmarkActions(bookmark, isOwner);

  return (
    <CardGestures
      actions={actions}
      label={ctx?.title}
      href={`/dashboard/bookmarks/${bookmark.id}`}
      onOpen={
        opensExternally
          ? openExternally
          : Platform.OS === "ios"
            ? undefined
            : () => router.push(`/dashboard/bookmarks/${bookmark.id}`)
      }
      overlay={
        <CardActions
          actions={actions}
          itemName={ctx?.title}
          compact={settings.bookmarkLayout === "list"}
        />
      }
    >
      <Layout
        ctx={{
          ...ctx,
          isOwner,
          actions,
          bookmark,
        }}
      />
    </CardGestures>
  );
}
