import AllListsView from "@/components/dashboard/lists/AllListsView";
import { EditListModal } from "@/components/dashboard/lists/EditListModal";
import { PendingInvitationsCard } from "@/components/dashboard/lists/PendingInvitationsCard";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { Plus } from "lucide-react";

export default async function ListsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const lists = await api.lists.list();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-2xl">📋 {t("lists.all_lists")}</p>
        <EditListModal>
          <Button className="flex items-center">
            <Plus className="mr-2 size-4" />
            <span>{t("lists.new_list")}</span>
          </Button>
        </EditListModal>
      </div>
      <PendingInvitationsCard />
      <div className="flex flex-col gap-3 rounded-md border bg-background p-4">
        <AllListsView initialData={lists.lists} />
      </div>
    </div>
  );
}
