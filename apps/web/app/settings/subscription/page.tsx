import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SubscriptionSettings from "@/components/settings/SubscriptionSettings";
import { QuotaProgress } from "@/components/subscription/QuotaProgress";

import serverConfig from "@karakeep/shared/config";

export const metadata: Metadata = {
  title: "Subscription | Karakeep",
};

export default async function SubscriptionPage() {
  if (!serverConfig.stripe.isConfigured) {
    redirect("/settings");
  }

  return (
    <div className="flex flex-col gap-4">
      <SubscriptionSettings />
      <QuotaProgress />
    </div>
  );
}
