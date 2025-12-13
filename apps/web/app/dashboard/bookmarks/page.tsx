import React from "react";
import { PageHeader } from "@/components/layout/page-header";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { useTranslation } from "@/lib/i18n/server";
import { Home } from "lucide-react";

export default async function BookmarksPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <div>
      <Bookmarks
        header={
          <PageHeader
            icon={<Home className="size-5" />}
            title={t("common.home")}
          />
        }
        query={{ archived: false }}
        showEditorCard={true}
      />
    </div>
  );
}
