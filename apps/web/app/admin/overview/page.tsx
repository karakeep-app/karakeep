import type { Metadata } from "next";
import BasicStats from "@/components/admin/BasicStats";
import ServiceConnections from "@/components/admin/ServiceConnections";

export const metadata: Metadata = {
  title: "Admin Overview | Karakeep",
};

export default function AdminOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <BasicStats />
      <ServiceConnections />
    </div>
  );
}
