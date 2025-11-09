import type { Metadata } from "next";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.rules.rules")} | Karakeep`,
  };
}

export default function RulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
