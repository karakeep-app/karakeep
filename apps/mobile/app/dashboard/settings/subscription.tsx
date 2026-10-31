import { useState } from "react";
import { Linking, Platform } from "react-native";
import Purchases from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
  SettingsValueRow,
} from "@/components/settings/settings-list";
import { useToast } from "@/components/ui/Toast";
import {
  useCommonStrings,
  useSharedTranslation,
  useTranslation,
} from "@/lib/i18n/hooks";
import type { MobileTFunction } from "@/lib/i18n/hooks";
import { getIntlLocale } from "@/lib/i18n";
import { useInAppPurchases } from "@/lib/purchases";
import { formatStorageSize } from "@/lib/storageSize";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

const STORE_SUBSCRIPTIONS_URL = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  default: "https://play.google.com/store/account/subscriptions",
});

function formatDate(date: Date | null | undefined, locale: string) {
  if (!date) return null;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatUsage(
  used: number,
  quota: number | null,
  format: (n: number) => string,
  t: MobileTFunction,
) {
  return quota === null
    ? t("subscription.usage_unlimited", { used: format(used) })
    : t("subscription.usage_of", { used: format(used), quota: format(quota) });
}

function formatBillingSource(
  provider: string | null | undefined,
  store: string | null | undefined,
  t: MobileTFunction,
) {
  if (provider === "stripe") return t("subscription.billed_web");
  if (provider !== "in_app") return null;
  switch (store) {
    case "app_store":
    case "mac_app_store":
      return t("subscription.billed_app_store");
    case "play_store":
      return t("subscription.billed_play_store");
    default:
      return t("subscription.billed_mobile_app");
  }
}

export default function SubscriptionSettings() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { t: tShared } = useSharedTranslation();
  const { bookmarks: bookmarksLabel } = useCommonStrings();
  const { isAvailable: canPurchase } = useInAppPurchases();
  const intlLocale = getIntlLocale();
  const countFormatter = new Intl.NumberFormat(intlLocale);
  const [pendingAction, setPendingAction] = useState<
    "upgrade" | "restore" | "manage" | null
  >(null);

  const { data: status, isLoading: isStatusLoading } = useQuery(
    api.subscriptions.getSubscriptionStatus.queryOptions(),
  );
  const { data: usage } = useQuery(
    api.subscriptions.getQuotaUsage.queryOptions(),
  );
  const { mutateAsync: syncWithRevenueCat } = useMutation(
    api.subscriptions.syncWithRevenueCat.mutationOptions(),
  );

  // The server is the source of truth for the plan, so after any purchase,
  // ask it to pull the latest state from RevenueCat instead of waiting for
  // the webhook.
  const refreshEntitlements = async () => {
    const { hasActiveSubscription } = await syncWithRevenueCat();
    await queryClient.invalidateQueries(api.subscriptions.pathFilter());
    return hasActiveSubscription;
  };

  const runAction = async (
    action: NonNullable<typeof pendingAction>,
    fn: () => Promise<void>,
  ) => {
    setPendingAction(action);
    try {
      await fn();
    } catch (error) {
      console.warn(`Subscription ${action} failed`, error);
      toast({
        message: t("subscription.error"),
        variant: "destructive",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const upgrade = () =>
    runAction("upgrade", async () => {
      const result = await RevenueCatUI.presentPaywall();
      // Failures resolve instead of rejecting, so surface them as errors.
      if (
        result === PAYWALL_RESULT.ERROR ||
        result === PAYWALL_RESULT.NOT_PRESENTED
      ) {
        throw new Error(`Paywall failed: ${result}`);
      }
      if (
        result === PAYWALL_RESULT.PURCHASED ||
        result === PAYWALL_RESULT.RESTORED
      ) {
        if (await refreshEntitlements()) {
          toast({
            message: t("subscription.upgraded"),
            variant: "success",
          });
        } else {
          toast({
            message: t("subscription.purchase_pending"),
            variant: "destructive",
          });
        }
      }
    });

  const restore = () =>
    runAction("restore", async () => {
      await Purchases.restorePurchases();
      toast({
        message: (await refreshEntitlements())
          ? t("subscription.purchases_restored")
          : t("subscription.no_subscription"),
      });
    });

  const manage = () =>
    runAction("manage", async () => {
      const customerInfo = await Purchases.getCustomerInfo();
      await Linking.openURL(
        customerInfo.managementURL ?? STORE_SUBSCRIPTIONS_URL,
      );
    });

  const planLabel =
    status?.tier === "custom"
      ? (status.manualTierName ?? t("subscription.plan_custom"))
      : status?.tier === "paid"
        ? tShared("settings.subscription.paid")
        : tShared("settings.subscription.free");
  const billingSource = status?.hasActiveSubscription
    ? formatBillingSource(status.provider, status.store, t)
    : null;
  const endDate = formatDate(status?.endDate, intlLocale);
  const isInAppSubscriber =
    status?.hasActiveSubscription && status.provider === "in_app";
  const isWebSubscriber =
    status?.hasActiveSubscription && status.provider === "stripe";

  let renewalLabel: string | null = null;
  if (status?.hasActiveSubscription && endDate) {
    renewalLabel = status.cancelAtPeriodEnd
      ? t("subscription.ends_on")
      : t("subscription.renews_on");
  }

  let planFooter: string | undefined;
  if (status?.status === "past_due" && isInAppSubscriber) {
    planFooter = t("subscription.past_due_footer");
  } else if (isWebSubscriber) {
    planFooter = t("subscription.web_managed_footer");
  } else if (status?.tier === "custom") {
    planFooter = t("subscription.custom_tier_footer");
  }

  const canUpgrade =
    canPurchase &&
    !!status &&
    !status.hasActiveSubscription &&
    status.tier !== "custom";

  return (
    <SettingsScreen>
      <SettingsGroup header={t("subscription.plan")} footer={planFooter}>
        <SettingsValueRow
          label={tShared("settings.subscription.current_plan")}
          value={isStatusLoading ? t("settings.loading") : planLabel}
        />
        {billingSource ? (
          <>
            <SettingsSeparator />
            <SettingsValueRow
              label={t("subscription.billed_through")}
              value={billingSource}
            />
          </>
        ) : null}
        {renewalLabel && endDate ? (
          <>
            <SettingsSeparator />
            <SettingsValueRow label={renewalLabel} value={endDate} />
          </>
        ) : null}
      </SettingsGroup>

      {usage ? (
        <SettingsGroup header={t("subscription.usage")}>
          <SettingsValueRow
            label={bookmarksLabel}
            value={formatUsage(
              usage.bookmarks.used,
              usage.bookmarks.quota,
              (n) => countFormatter.format(n),
              t,
            )}
          />
          <SettingsSeparator />
          <SettingsValueRow
            label={t("subscription.storage")}
            value={formatUsage(
              usage.storage.used,
              usage.storage.quota,
              (n) => formatStorageSize(n, intlLocale),
              t,
            )}
          />
        </SettingsGroup>
      ) : null}

      {canPurchase && !isWebSubscriber ? (
        <SettingsGroup>
          {canUpgrade ? (
            <>
              <SettingsActionRow
                disabled={pendingAction !== null}
                isLoading={pendingAction === "upgrade"}
                label={t("subscription.upgrade")}
                onPress={upgrade}
                tone="primary"
              />
              <SettingsSeparator />
            </>
          ) : null}
          {isInAppSubscriber ? (
            <>
              <SettingsActionRow
                disabled={pendingAction !== null}
                isLoading={pendingAction === "manage"}
                label={t("subscription.manage")}
                onPress={manage}
                tone="primary"
              />
              <SettingsSeparator />
            </>
          ) : null}
          <SettingsActionRow
            disabled={pendingAction !== null}
            isLoading={pendingAction === "restore"}
            label={t("subscription.restore")}
            onPress={restore}
            tone="default"
          />
        </SettingsGroup>
      ) : null}
    </SettingsScreen>
  );
}
