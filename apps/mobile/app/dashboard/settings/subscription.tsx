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
import { useInAppPurchases } from "@/lib/purchases";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

const STORE_SUBSCRIPTIONS_URL = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  default: "https://play.google.com/store/account/subscriptions",
});

const countFormatter = new Intl.NumberFormat();
const storageFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${countFormatter.format(bytes)} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${storageFormatter.format(value)} ${units[unitIndex]}`;
}

function formatDate(date: Date | null | undefined) {
  if (!date) return null;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatUsage(
  used: number,
  quota: number | null,
  format: (n: number) => string,
) {
  return quota === null
    ? `${format(used)} (unlimited)`
    : `${format(used)} of ${format(quota)}`;
}

function formatBillingSource(
  provider: string | null | undefined,
  store: string | null | undefined,
) {
  if (provider === "stripe") return "Web";
  if (provider !== "in_app") return null;
  switch (store) {
    case "app_store":
    case "mac_app_store":
      return "App Store";
    case "play_store":
      return "Google Play";
    default:
      return "Mobile app";
  }
}

export default function SubscriptionSettings() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAvailable: canPurchase } = useInAppPurchases();
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
        message: "Something went wrong. Please try again.",
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
            message: "You're now on the Paid plan.",
            variant: "success",
          });
        } else {
          toast({
            message:
              "We couldn't confirm your purchase yet. Try Restore Purchases in a moment.",
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
          ? "Purchases restored"
          : "No active subscription found",
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
      ? (status.manualTierName ?? "Custom")
      : status?.tier === "paid"
        ? "Paid"
        : "Free";
  const billingSource = status?.hasActiveSubscription
    ? formatBillingSource(status.provider, status.store)
    : null;
  const endDate = formatDate(status?.endDate);
  const isInAppSubscriber =
    status?.hasActiveSubscription && status.provider === "in_app";
  const isWebSubscriber =
    status?.hasActiveSubscription && status.provider === "stripe";

  let renewalLabel: string | null = null;
  if (status?.hasActiveSubscription && endDate) {
    renewalLabel = status.cancelAtPeriodEnd ? "Ends on" : "Renews on";
  }

  let planFooter: string | undefined;
  if (status?.status === "past_due" && isInAppSubscriber) {
    planFooter =
      "There's a problem with your payment method. Update it in your store's subscription settings to keep your plan.";
  } else if (isWebSubscriber) {
    planFooter =
      "Your subscription is managed from the Karakeep web app's settings.";
  } else if (status?.tier === "custom") {
    planFooter = "Your plan is managed by the Karakeep team.";
  }

  const canUpgrade =
    canPurchase &&
    !!status &&
    !status.hasActiveSubscription &&
    status.tier !== "custom";

  return (
    <SettingsScreen>
      <SettingsGroup header="Plan" footer={planFooter}>
        <SettingsValueRow
          label="Current plan"
          value={isStatusLoading ? "Loading..." : planLabel}
        />
        {billingSource ? (
          <>
            <SettingsSeparator />
            <SettingsValueRow label="Billed through" value={billingSource} />
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
        <SettingsGroup header="Usage">
          <SettingsValueRow
            label="Bookmarks"
            value={formatUsage(
              usage.bookmarks.used,
              usage.bookmarks.quota,
              (n) => countFormatter.format(n),
            )}
          />
          <SettingsSeparator />
          <SettingsValueRow
            label="Storage"
            value={formatUsage(
              usage.storage.used,
              usage.storage.quota,
              formatBytes,
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
                label="Upgrade"
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
                label="Manage Subscription"
                onPress={manage}
                tone="primary"
              />
              <SettingsSeparator />
            </>
          ) : null}
          <SettingsActionRow
            disabled={pendingAction !== null}
            isLoading={pendingAction === "restore"}
            label="Restore Purchases"
            onPress={restore}
            tone="default"
          />
        </SettingsGroup>
      ) : null}
    </SettingsScreen>
  );
}
