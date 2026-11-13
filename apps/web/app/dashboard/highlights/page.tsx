import type { Metadata } from "next";
import AllHighlights from "@/components/dashboard/highlights/AllHighlights";
import { PageHeader } from "@/components/ui/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.highlights")} | Karakeep`,
  };
}

export default async function HighlightsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const highlights = await api.highlights.getAll({});
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("common.highlights")} />
      <AllHighlights highlights={highlights} />
    </div>
  );
}
