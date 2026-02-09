import type { Metadata } from "next";
import BookmarkDebugger from "@/components/admin/BookmarkDebugger";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("admin.admin_tools.admin_tools")} | Karakeep`,
  };
}

export default function AdminToolsPage() {
  return (
    <div className="flex flex-col gap-6">
      <BookmarkDebugger />
    </div>
  );
}
