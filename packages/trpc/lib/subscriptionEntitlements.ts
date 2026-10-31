import { eq } from "drizzle-orm";

import type { KarakeepDBTransaction } from "@karakeep/db";
import { inAppSubscriptions, subscriptions, users } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";

// Statuses that keep the paid entitlements. `past_due` means a renewal charge
// failed and Stripe is still retrying it; the user keeps the paid tier during
// that window and gets downgraded once Stripe gives up and moves the
// subscription to `canceled` or `unpaid`.
export function isPaidStatus(status: string | null | undefined) {
  return status === "active" || status === "trialing" || status === "past_due";
}

export function getActivePaidSubscriptionProvider(
  trx: KarakeepDBTransaction,
  userId: string,
): "stripe" | "in_app" | null {
  const stripeSubscription = trx
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .get();
  if (isPaidStatus(stripeSubscription?.status)) {
    return "stripe";
  }

  const inAppSubscription = trx
    .select({ status: inAppSubscriptions.status })
    .from(inAppSubscriptions)
    .where(eq(inAppSubscriptions.userId, userId))
    .get();
  if (inAppSubscription?.status === "active") {
    return "in_app";
  }

  return null;
}

/**
 * Recomputes the user's quotas from all of their subscription sources (Stripe
 * and in-app purchases). Must be called after the subscription rows are
 * updated, within the same transaction.
 *
 * - Any active paid subscription grants the paid tier, and supersedes a
 *   manually granted tier (which gets cleared).
 * - Otherwise, a manually granted tier is left untouched.
 * - Otherwise, the user is moved to the free tier.
 */
export function applyUserTierQuotas(
  trx: KarakeepDBTransaction,
  userId: string,
): "paid" | "free" | "manual" {
  if (getActivePaidSubscriptionProvider(trx, userId) !== null) {
    trx
      .update(users)
      .set({
        bookmarkQuota: serverConfig.quotas.paid.bookmarkLimit,
        storageQuota: serverConfig.quotas.paid.assetSizeBytes,
        browserCrawlingEnabled: serverConfig.quotas.paid.browserCrawlingEnabled,
        manualTierName: null,
      })
      .where(eq(users.id, userId))
      .run();
    return "paid";
  }

  const user = trx
    .select({ manualTierName: users.manualTierName })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (user?.manualTierName) {
    return "manual";
  }

  trx
    .update(users)
    .set({
      bookmarkQuota: serverConfig.quotas.free.bookmarkLimit,
      storageQuota: serverConfig.quotas.free.assetSizeBytes,
      browserCrawlingEnabled: serverConfig.quotas.free.browserCrawlingEnabled,
    })
    .where(eq(users.id, userId))
    .run();
  return "free";
}
