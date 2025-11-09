import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SubscriptionSettings from "@/components/settings/SubscriptionSettings";
import { QuotaProgress } from "@/components/subscription/QuotaProgress";
import { useTranslation } from "@/lib/i18n/server";

import serverConfig from "@karakeep/shared/config";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.subscription.subscription")} | Karakeep`,
  };
}

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
