import type { Metadata } from "next";
import React from "react";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.home")} | Karakeep`,
  };
}

export default async function BookmarksPage() {
  return (
    <div>
      <Bookmarks query={{ archived: false }} showEditorCard={true} />
    </div>
  );
}
