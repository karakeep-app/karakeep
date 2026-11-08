"use client";

import { useMemo } from "react";
import Link from "next/link";
import SmartListMarker from "@/components/shared/sidebar/SmartListMarker";
import { Button, ButtonWithTooltip } from "@/components/ui/button";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  Archive,
  ChevronRight,
  FolderPlus,
  ListPlus,
  MoreHorizontal,
  ListFilter,
  Star,
} from "lucide-react";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  augmentBookmarkListsWithInitialData,
  useBookmarkLists,
} from "@karakeep/shared-react/hooks/lists";

import { CollapsibleBookmarkLists } from "./CollapsibleBookmarkLists";
import { EditListModal } from "./EditListModal";
import { ListOptions } from "./ListOptions";
import {
  ListCollaboratorsIcons,
  ListItemCount,
  ListPrivacyLabel,
} from "./ListHeaderComponents";

function ListItem({
  name,
  icon,
  path,
  style,
  list,
  open,
  collapsible,
  itemCount,
  description,
}: {
  name: string;
  icon: React.ReactNode;
  path: string;
  list?: ZBookmarkList;
  open?: boolean;
  collapsible: boolean;
  itemCount?: number;
  description?: string;
  style?: React.CSSProperties;
}) {
  const { t } = useTranslation();

  return (
    <li
      className="group/list-row flex min-h-16 items-center justify-between gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-accent/30"
      style={style}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-full items-center justify-end gap-2">
          {collapsible ? (
            <CollapsibleTrigger asChild>
              <ButtonWithTooltip
                tooltip={t(open ? "actions.collapse" : "actions.expand")}
                aria-label={t(open ? "actions.collapse" : "actions.expand")}
                variant="ghost"
                size="none"
                // The pseudo element is the hit area: 32px, or 44px at phone width.
                className="relative size-4 shrink-0 rounded-sm text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:bg-transparent hover:text-foreground max-sm:after:-inset-3.5"
              >
                <ChevronRight
                  className={cn(
                    "size-4 transition-transform",
                    open && "rotate-90",
                  )}
                />
              </ButtonWithTooltip>
            </CollapsibleTrigger>
          ) : (
            // Lines up with the rows that have a chevron, where there's room to.
            <span className="size-4 shrink-0 max-sm:hidden" />
          )}
        </div>
        <Link href={path} className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg text-muted-foreground">
            {icon}
          </span>
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-sm font-medium text-foreground">
                {name}
              </p>
              {list?.type === "smart" && <SmartListMarker query={list.query} />}
            </div>
            {/* A fixed line about a built-in list makes way for the count on phones. */}
            {description && (
              <p className="truncate text-sm text-muted-foreground max-sm:hidden">
                {description}
              </p>
            )}
            {!description && list?.description && (
              <p className="truncate text-sm text-muted-foreground">
                {list.description}
              </p>
            )}
            <div className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground sm:hidden">
              {list ? (
                <>
                  <ListItemCount list={list} />
                  <span aria-hidden>·</span>
                  <ListPrivacyLabel list={list} />
                </>
              ) : (
                itemCount !== undefined &&
                t("lists.items_count", { count: itemCount })
              )}
            </div>
          </div>
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
        {list && (
          <>
            <div className="hidden items-center gap-2 sm:flex">
              <ListCollaboratorsIcons className="mr-4" list={list} />
              <ListPrivacyLabel className="truncate" list={list} />
              <span aria-hidden>·</span>
              <ListItemCount className="text-muted-foreground" list={list} />
            </div>
            <ListOptions list={list}>
              <ButtonWithTooltip
                tooltip={t("actions.more")}
                aria-label={t("actions.more")}
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground max-sm:size-11"
              >
                <MoreHorizontal className="size-4" />
              </ButtonWithTooltip>
            </ListOptions>
          </>
        )}
        {!list && itemCount !== undefined && (
          <span className="hidden items-center gap-2 sm:flex">
            {t("lists.items_count", { count: itemCount })}
          </span>
        )}
      </div>
    </li>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {children}
      </div>
    </section>
  );
}

export default function AllListsView({
  initialData,
  favoritesCount,
  archivedCount,
}: {
  initialData: ZBookmarkList[];
  favoritesCount?: number;
  archivedCount?: number;
}) {
  const { t } = useTranslation();

  // Fetch live lists data
  const { data: listsData } = useBookmarkLists(undefined, {
    initialData: { lists: initialData },
  });
  const lists = augmentBookmarkListsWithInitialData(listsData, initialData);

  // Check if there are any shared lists
  const hasSharedLists = useMemo(() => {
    return lists.data.some((list) => list.userRole !== "owner");
  }, [lists.data]);

  const hasOwnedLists = useMemo(() => {
    return lists.data.some((list) => list.userRole === "owner");
  }, [lists.data]);

  return (
    <div className="space-y-8">
      <Section title={t("lists.pinned")}>
        <ul className="divide-y">
          <ListItem
            collapsible={false}
            name={t("lists.favourites")}
            icon={<Star className="size-4" />}
            description={t("lists.favourites_description")}
            itemCount={favoritesCount}
            path={`/dashboard/favourites`}
          />
          <ListItem
            collapsible={false}
            name={t("common.archive")}
            icon={<Archive className="size-4" />}
            description={t("lists.archive_description")}
            itemCount={archivedCount}
            path={`/dashboard/archive`}
          />
        </ul>
      </Section>

      {!hasOwnedLists && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t("lists.your_lists")}</h2>
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderPlus />
              </EmptyMedia>
              <EmptyTitle>{t("lists.no_lists_yet")}</EmptyTitle>
              <EmptyDescription>
                {t("lists.no_lists_yet_description")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {
                <div className="flex flex-wrap justify-center gap-2">
                  <EditListModal prefill={{ type: "manual" }}>
                    <Button>
                      <ListPlus className="size-4" />
                      {t("lists.new_manual_list")}
                    </Button>
                  </EditListModal>
                  <EditListModal prefill={{ type: "smart" }}>
                    <Button variant="outline">
                      <ListFilter className="size-4" />
                      {t("lists.new_smart_list")}
                    </Button>
                  </EditListModal>
                </div>
              }
            </EmptyContent>
          </Empty>
        </section>
      )}

      {hasOwnedLists && (
        <Section title={t("lists.your_lists")}>
          <CollapsibleBookmarkLists
            className="border-b last:border-b-0"
            listsData={lists}
            filter={(node) => node.item.userRole === "owner"}
            render={({ node, level, open, numBookmarks }) => (
              <ListItem
                name={node.item.name}
                icon={node.item.icon}
                itemCount={numBookmarks}
                list={node.item}
                path={`/dashboard/lists/${node.item.id}`}
                collapsible={node.children.length > 0}
                open={open}
                style={{ marginLeft: `${level * 1}rem` }}
              />
            )}
          />
        </Section>
      )}

      {hasSharedLists && (
        <Section title={t("lists.shared_lists")}>
          <CollapsibleBookmarkLists
            className="border-b last:border-b-0"
            listsData={lists}
            filter={(node) => node.item.userRole !== "owner"}
            render={({ node, open, numBookmarks }) => (
              <ListItem
                name={node.item.name}
                icon={node.item.icon}
                itemCount={numBookmarks}
                list={node.item}
                path={`/dashboard/lists/${node.item.id}`}
                collapsible={node.children.length > 0}
                open={open}
              />
            )}
          />
        </Section>
      )}
    </div>
  );
}
