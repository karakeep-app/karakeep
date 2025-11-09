import type { Metadata } from "next";
import AllTagsView from "@/components/dashboard/tags/AllTagsView";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("tags.all_tags")} | Karakeep`,
  };
}

export default async function TagsPage() {
  return <AllTagsView />;
}
