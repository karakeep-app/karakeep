import type { Metadata } from "next";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { PageHeader } from "@/components/layout/page-header";
import InfoTooltip from "@/components/ui/info-tooltip";
import { useTranslation } from "@/lib/i18n/server";
import { Archive as ArchiveIcon } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.archive")} | Karakeep`,
  };
}

export default async function ArchivedBookmarkPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <Bookmarks
      header={
        <PageHeader
          icon={<ArchiveIcon className="size-5" />}
          title={t("common.archive")}
          actions={
            <InfoTooltip size={17} className="my-auto" variant="explain">
              <p>Archived bookmarks won&apos;t appear in the homepage</p>
            </InfoTooltip>
          }
        />
      }
      query={{ archived: true }}
      showDivider={true}
      showEditorCard={true}
    />
  );
}
