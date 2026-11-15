import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import PublicBookmarkGrid from "@/components/public/lists/PublicBookmarkGrid";
import PublicListHeader from "@/components/public/lists/PublicListHeader";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";
import { Bookmark } from "lucide-react";

export async function generateMetadata(props: {
  params: Promise<{ listId: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  try {
    const resp = await api.publicBookmarks.getPublicListMetadata({
      listId: params.listId,
    });
    return {
      title: `${resp.name} by ${resp.ownerName} - Karakeep`,
      description:
        resp.description && resp.description.length > 0
          ? `${resp.description} by ${resp.ownerName} on Karakeep`
          : undefined,
      applicationName: "Karakeep",
      authors: [
        {
          name: resp.ownerName,
        },
      ],
    };
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
  }
  return {
    title: "Karakeep",
  };
}

export default async function PublicListPage(props: {
  params: Promise<{ listId: string }>;
}) {
  const params = await props.params;
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  try {
    const { list, bookmarks, nextCursor } =
      await api.publicBookmarks.getPublicBookmarksInList({
        listId: params.listId,
      });
    return (
      <div className="space-y-3">
        <PublicListHeader
          list={{
            id: params.listId,
            name: list.name,
            description: list.description,
            icon: list.icon,
            numItems: list.numItems,
            ownerName: list.ownerName,
          }}
        />
        {list.numItems > 0 ? (
          <PublicBookmarkGrid
            list={{
              id: params.listId,
              name: list.name,
              description: list.description,
              icon: list.icon,
              numItems: list.numItems,
              ownerName: list.ownerName,
            }}
            bookmarks={bookmarks}
            nextCursor={nextCursor}
          />
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bookmark />
              </EmptyMedia>
              <EmptyTitle>{t("public_lists.empty_title")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    );
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
  }
}
