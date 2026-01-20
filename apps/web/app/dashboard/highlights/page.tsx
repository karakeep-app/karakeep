import type { Metadata } from "next";
import AllHighlights from "@/components/dashboard/highlights/AllHighlights";
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center">
        <Highlighter className="mr-2" />
        <p className="text-2xl">{t("common.highlights")}</p>
      </div>
      <div className="flex flex-col gap-8 rounded-md border bg-background p-4">
        <AllHighlights highlights={highlights} />
      </div>
    </div>
  );
}
