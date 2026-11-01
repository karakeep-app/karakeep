import type { Metadata } from "next";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import InfoTooltip from "@/components/ui/info-tooltip";
import { useTranslation } from "@/lib/i18n/server";

import { TRASH_RETENTION_DAYS } from "@karakeep/shared/types/bookmarks";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.trash")} | Karakeep`,
  };
}

export default async function TrashPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <Bookmarks
      header={
        <div className="flex gap-2">
          <p className="text-2xl">🗑️ {t("common.trash")}</p>
          <InfoTooltip size={17} className="my-auto" variant="explain">
            <p>{t("trash.retention", { days: TRASH_RETENTION_DAYS })}</p>
          </InfoTooltip>
        </div>
      }
      query={{ trashed: true }}
      showDivider={true}
    />
  );
}
