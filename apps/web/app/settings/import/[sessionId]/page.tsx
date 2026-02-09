import type { Metadata } from "next";
import ImportSessionDetail from "@/components/settings/ImportSessionDetail";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.import_sessions.detail.page_title")} | Karakeep`,
  };
}

export default async function ImportSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ImportSessionDetail sessionId={sessionId} />;
}
