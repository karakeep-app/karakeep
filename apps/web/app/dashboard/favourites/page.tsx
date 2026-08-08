import type { Metadata } from "next";
import DenseFiles from "@/components/dashboard/dense/DenseFiles";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("lists.favourites")} | Karakeep`,
  };
}

export default async function FavouritesBookmarkPage() {
  return <DenseFiles label="Favourites" query={{ favourited: true }} />;
}
