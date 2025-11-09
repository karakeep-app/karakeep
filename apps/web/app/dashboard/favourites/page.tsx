import type { Metadata } from "next";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("lists.favourites")} | Karakeep`,
  };
}

export default async function FavouritesBookmarkPage() {
  return (
    <Bookmarks
      header={
        <div className="flex items-center justify-between">
          <p className="text-2xl">⭐️ Favourites</p>
        </div>
      }
      query={{ favourited: true }}
      showDivider={true}
      showEditorCard={true}
    />
  );
}
