import AllListsView from "@/components/dashboard/lists/AllListsView";
import { NewListButton } from "@/components/dashboard/lists/NewListButton";
import { PendingInvitationsCard } from "@/components/dashboard/lists/PendingInvitationsCard";
import { PageHeader } from "@/components/ui/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";

export default async function ListsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const [lists, stats] = await Promise.all([
    api.lists.list(),
    api.users.bookmarkCounts(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("lists.all_lists")}
        description={
          lists.lists.length > 0
            ? `${t("lists.summary_list", { count: lists.lists.length })} · ${t("lists.summary_bookmark", { count: stats.numBookmarks })}`
            : undefined
        }
        actions={<NewListButton />}
      />
      <PendingInvitationsCard />
      <AllListsView
        archivedCount={stats.numArchived}
        favoritesCount={stats.numFavorites}
        initialData={lists.lists}
      />
    </div>
  );
}
