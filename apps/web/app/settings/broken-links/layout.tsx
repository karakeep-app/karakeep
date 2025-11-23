import type { Metadata } from "next";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.broken_links.broken_links")} | Karakeep`,
  };
}

export default function BrokenLinksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
