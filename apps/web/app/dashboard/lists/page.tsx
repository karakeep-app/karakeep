import AllListsView from "@/components/dashboard/lists/AllListsView";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { ClipboardList } from "lucide-react";

export default async function ListsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const lists = await api.lists.list();

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<ClipboardList className="size-5" />}
        title={t("lists.all_lists")}
      />
      <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
        <AllListsView initialData={lists.lists} />
      </div>
    </div>
  );
}
