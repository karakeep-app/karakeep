import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SubscriptionSettings from "@/components/settings/SubscriptionSettings";
import { QuotaProgress } from "@/components/subscription/QuotaProgress";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { CreditCard } from "lucide-react";

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

  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <div className="space-y-4">
      <PageHeader
        icon={<CreditCard className="size-5" />}
        title={t("settings.subscription.subscription")}
      />
      <div className="flex flex-col gap-4">
        <SubscriptionSettings />
        <QuotaProgress />
      </div>
    </div>
  );
}
