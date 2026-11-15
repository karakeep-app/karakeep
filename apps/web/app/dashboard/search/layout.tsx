import type { Metadata } from "next";
import { useTranslation } from "@/lib/i18n/server";

// The page is a client component, so its title is set here.
export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.search")} | Karakeep`,
  };
}

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
