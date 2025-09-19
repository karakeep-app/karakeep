import { AdminCard } from "@/components/admin/AdminCard";
import ServerStats from "@/components/admin/ServerStats";

export default function AdminOverviewPage() {
  return (
    <AdminCard>
      <ServerStats />
    </AdminCard>
  );
}
