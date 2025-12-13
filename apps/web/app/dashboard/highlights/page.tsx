import type { Metadata } from "next";
import AllHighlights from "@/components/dashboard/highlights/AllHighlights";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { Highlighter } from "lucide-react";

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
    <div className="space-y-4">
      <PageHeader
        icon={<Highlighter className="size-5" />}
        title={t("common.highlights")}
      />
      <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
        <AllHighlights highlights={highlights} />
      </div>
    </div>
  );
}
