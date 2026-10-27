import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { inAppSubscriptions } from "@karakeep/db/schema";
import { addLogFields, withEventLog } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";

import type { Context } from "../index";
import { applyUserTierQuotas } from "./subscriptionEntitlements";

const REVENUECAT_API_ORIGIN = "https://api.revenuecat.com";
const REVENUECAT_ANONYMOUS_ID_PREFIX = "$RCAnonymousID:";

// Only the fields we care about from
// https://www.revenuecat.com/docs/api-v2#tag/Customer-Information. All the
// timestamps are in ms since epoch.
// This list is paginated too, but only its first page (20 items) is read: a
// product grants far fewer entitlements than that.
const zEntitlementList = z.object({
  items: z.array(z.object({ lookup_key: z.string() })),
});

const zSubscription = z.object({
  product_id: z.string().nullable(),
  starts_at: z.number(),
  current_period_ends_at: z.number().nullable(),
  gives_access: z.boolean(),
  auto_renewal_status: z.string(),
  status: z.string(),
  environment: z.string(),
  store: z.string(),
  entitlements: zEntitlementList,
});

const zPurchase = z.object({
  product_id: z.string(),
  purchased_at: z.number(),
  status: z.string(),
  environment: z.string(),
  store: z.string(),
  entitlements: zEntitlementList,
});

export type RevenueCatSubscription = z.infer<typeof zSubscription>;
export type RevenueCatPurchase = z.infer<typeof zPurchase>;

export interface RevenueCatCustomer {
  subscriptions: RevenueCatSubscription[];
  purchases: RevenueCatPurchase[];
}

export const zRevenueCatWebhookBody = z.object({
  event: z.object({
    type: z.string(),
    app_user_id: z.string().nullish(),
    original_app_user_id: z.string().nullish(),
    aliases: z.array(z.string()).nullish(),
    transferred_from: z.array(z.string()).nullish(),
    transferred_to: z.array(z.string()).nullish(),
  }),
});

export type RevenueCatWebhookEvent = z.infer<
  typeof zRevenueCatWebhookBody
>["event"];

export interface InAppSubscriptionState {
  status: "active" | "expired";
  store: string | null;
  productId: string;
  cancelAtPeriodEnd: boolean;
  billingIssue: boolean;
  isSandbox: boolean;
  startDate: Date | null;
  endDate: Date | null;
}

function subscriptionState(
  subscription: RevenueCatSubscription,
  isActive: boolean,
): InAppSubscriptionState {
  return {
    status: isActive ? "active" : "expired",
    store: subscription.store,
    productId: subscription.product_id ?? "",
    cancelAtPeriodEnd: subscription.auto_renewal_status === "will_not_renew",
    billingIssue:
      subscription.status === "in_grace_period" ||
      subscription.status === "in_billing_retry",
    isSandbox: subscription.environment === "sandbox",
    startDate: new Date(subscription.starts_at),
    // Null while a subscription is paused indefinitely.
    endDate:
      subscription.current_period_ends_at === null
        ? null
        : new Date(subscription.current_period_ends_at),
  };
}

function purchaseState(
  purchase: RevenueCatPurchase,
  isActive: boolean,
): InAppSubscriptionState {
  return {
    status: isActive ? "active" : "expired",
    store: purchase.store,
    productId: purchase.product_id,
    cancelAtPeriodEnd: false,
    billingIssue: false,
    isSandbox: purchase.environment === "sandbox",
    startDate: new Date(purchase.purchased_at),
    // One-time purchases grant a lifetime entitlement.
    endDate: null,
  };
}

/**
 * Derives the state of the configured entitlement from a RevenueCat
 * customer. Returns null if the customer never had the entitlement.
 */
export function computeInAppSubscriptionState(
  customer: RevenueCatCustomer,
  opts: {
    entitlementId: string;
    allowSandboxPurchases: boolean;
  },
): InAppSubscriptionState | null {
  const grantsEntitlement = (item: {
    entitlements: { items: { lookup_key: string }[] };
  }) =>
    item.entitlements.items.some((e) => e.lookup_key === opts.entitlementId);
  const isAllowed = (item: { environment: string }) =>
    opts.allowSandboxPurchases || item.environment !== "sandbox";
  // A null period end means paused indefinitely, so it sorts last.
  const latestFirst = (a: RevenueCatSubscription, b: RevenueCatSubscription) =>
    (b.current_period_ends_at ?? Infinity) -
    (a.current_period_ends_at ?? Infinity);

  const subscriptions = customer.subscriptions
    .filter(grantsEntitlement)
    .sort(latestFirst);
  const purchases = customer.purchases
    .filter(grantsEntitlement)
    .sort((a, b) => b.purchased_at - a.purchased_at);

  // RevenueCat's `gives_access` already accounts for grace periods.
  const activeSubscription = subscriptions.find(
    (s) => s.gives_access && isAllowed(s),
  );
  if (activeSubscription) {
    return subscriptionState(activeSubscription, true);
  }
  const ownedPurchase = purchases.find(
    (p) => p.status === "owned" && isAllowed(p),
  );
  if (ownedPurchase) {
    return purchaseState(ownedPurchase, true);
  }
  if (subscriptions[0]) {
    return subscriptionState(subscriptions[0], false);
  }
  if (purchases[0]) {
    return purchaseState(purchases[0], false);
  }
  return null;
}

async function fetchRevenueCatList<T extends z.ZodTypeAny>(
  path: string,
  item: T,
): Promise<z.infer<T>[]> {
  const secretApiKey = serverConfig.revenueCat.secretApiKey;
  if (!secretApiKey) {
    throw new Error("RevenueCat is not configured");
  }
  const zPage = z.object({
    items: z.array(item),
    next_page: z.string().nullish(),
  });
  const items: z.infer<T>[] = [];
  let nextPath: string | null | undefined = `${path}?limit=100`;
  while (nextPath) {
    const response = await fetch(`${REVENUECAT_API_ORIGIN}${nextPath}`, {
      headers: {
        Authorization: `Bearer ${secretApiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    // A customer that RevenueCat has never seen has no purchases.
    if (response.status === 404) {
      return [];
    }
    if (!response.ok) {
      throw new Error(
        `RevenueCat API request failed with status ${response.status}`,
      );
    }
    const page = zPage.parse(await response.json());
    items.push(...page.items);
    nextPath = page.next_page;
  }
  return items;
}

export async function fetchRevenueCatCustomer(
  appUserId: string,
): Promise<RevenueCatCustomer> {
  const projectId = serverConfig.revenueCat.projectId;
  if (!projectId) {
    throw new Error("RevenueCat is not configured");
  }
  const customerPath = `/v2/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(appUserId)}`;
  const [subscriptions, purchases] = await Promise.all([
    fetchRevenueCatList(`${customerPath}/subscriptions`, zSubscription),
    fetchRevenueCatList(`${customerPath}/purchases`, zPurchase),
  ]);
  return { subscriptions, purchases };
}

interface UserSyncQueue {
  // Settles once every sync queued for the user so far has finished.
  tail: Promise<void>;
  // A queued sync that hasn't fetched from RevenueCat yet.
  pending: Promise<InAppSubscriptionState | null> | null;
}

const userSyncQueues = new Map<string, UserSyncQueue>();

/**
 * Fetches the user's entitlement from RevenueCat (the source of truth) and
 * mirrors it into the database, updating the user's quotas accordingly. The
 * Karakeep user ID is used as the RevenueCat app user ID.
 *
 * Syncs of the same user run one at a time, so a slow RevenueCat response
 * can't overwrite the state written by a newer one. Callers that arrive while
 * a sync is waiting to start share it, as it will fetch fresh data anyway.
 * This only serializes syncs within this process.
 */
export function syncRevenueCatDataToDatabase(
  userId: string,
  db: Context["db"],
): Promise<InAppSubscriptionState | null> {
  let queue = userSyncQueues.get(userId);
  if (!queue) {
    queue = { tail: Promise.resolve(), pending: null };
    userSyncQueues.set(userId, queue);
  }
  if (queue.pending) {
    return queue.pending;
  }
  const q = queue;
  const sync = q.tail.then(() => {
    // From here on, the fetch might miss newer changes, so later callers
    // need a sync of their own.
    q.pending = null;
    return fetchAndStoreRevenueCatState(userId, db);
  });
  q.pending = sync;
  // Drop the queue once nothing else got queued behind this sync.
  const cleanUp = () => {
    if (q.tail === tail) {
      userSyncQueues.delete(userId);
    }
  };
  const tail = sync.then(cleanUp, cleanUp);
  q.tail = tail;
  return sync;
}

async function fetchAndStoreRevenueCatState(
  userId: string,
  db: Context["db"],
): Promise<InAppSubscriptionState | null> {
  return withEventLog("subscription.in_app_synced", async () => {
    addLogFields<"subscription.in_app_synced">({ "user.id": userId });

    const customer = await fetchRevenueCatCustomer(userId);
    let state = computeInAppSubscriptionState(customer, {
      entitlementId: serverConfig.revenueCat.entitlementId,
      allowSandboxPurchases: serverConfig.revenueCat.allowSandboxPurchases,
    });

    const existing = await db.query.inAppSubscriptions.findFirst({
      where: eq(inAppSubscriptions.userId, userId),
    });

    if (!state) {
      if (!existing) {
        addLogFields<"subscription.in_app_synced">({
          "subscription.sync_skipped_reason": "no_entitlement",
        });
        return null;
      }
      // The entitlement disappeared entirely (e.g. the purchase got
      // transferred to another user), so it's no longer active.
      state = {
        status: "expired",
        store: existing.store,
        productId: existing.productId ?? "",
        cancelAtPeriodEnd: false,
        billingIssue: false,
        isSandbox: existing.isSandbox,
        startDate: existing.startDate,
        endDate: existing.endDate,
      };
    }

    const row = {
      store: state.store,
      productId: state.productId || null,
      status: state.status,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      billingIssue: state.billingIssue,
      isSandbox: state.isSandbox,
      startDate: state.startDate,
      endDate: state.endDate,
    };

    const tier = db.transaction((trx) => {
      trx
        .insert(inAppSubscriptions)
        .values({ userId, ...row })
        .onConflictDoUpdate({
          target: inAppSubscriptions.userId,
          set: { ...row, modifiedAt: new Date() },
        })
        .run();
      return applyUserTierQuotas(trx, userId);
    });

    addLogFields<"subscription.in_app_synced">({
      "revenuecat.store": state.store ?? undefined,
      "revenuecat.product_id": state.productId,
      "subscription.status": state.status,
      "subscription.prev_status": existing?.status,
      "subscription.tier": tier,
      "subscription.cancel_at_period_end": state.cancelAtPeriodEnd,
      "subscription.is_sandbox": state.isSandbox,
    });

    return state;
  });
}

/**
 * RevenueCat sends the configured authorization header value verbatim. Accept
 * both a raw token and a "Bearer <token>" value.
 */
export function isValidRevenueCatWebhookAuthorization(
  authorization: string | undefined,
): boolean {
  const token = serverConfig.revenueCat.webhookAuthToken;
  if (!token || !authorization) {
    return false;
  }
  const provided = Buffer.from(authorization.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(token.replace(/^Bearer\s+/i, ""));
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

/**
 * Returns all the app user IDs that an event might affect. Transfers move
 * entitlements between users, so both sides need to be re-synced.
 */
export function getRevenueCatWebhookAppUserIds(
  event: RevenueCatWebhookEvent,
): string[] {
  const ids = new Set<string>([
    ...(event.app_user_id ? [event.app_user_id] : []),
    ...(event.original_app_user_id ? [event.original_app_user_id] : []),
    ...(event.aliases ?? []),
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ]);
  return [...ids].filter(
    (id) => id && !id.startsWith(REVENUECAT_ANONYMOUS_ID_PREFIX),
  );
}
