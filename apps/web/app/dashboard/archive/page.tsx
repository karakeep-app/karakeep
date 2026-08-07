import type { Metadata } from "next";
import DenseFiles from "@/components/dashboard/dense/DenseFiles";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.archive")} | Karakeep`,
  };
}

export default async function ArchivedBookmarkPage() {
  return <DenseFiles label="Archive" query={{ archived: true }} />;
}
