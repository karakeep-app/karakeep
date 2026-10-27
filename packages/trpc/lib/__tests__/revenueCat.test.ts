import { describe, expect, it } from "vitest";

import type {
  RevenueCatCustomer,
  RevenueCatPurchase,
  RevenueCatSubscription,
} from "../revenueCat";
import {
  computeInAppSubscriptionState,
  getRevenueCatWebhookAppUserIds,
} from "../revenueCat";

const opts = { entitlementId: "pro", allowSandboxPurchases: true };

function subscription(
  overrides: Partial<RevenueCatSubscription> = {},
): RevenueCatSubscription {
  return {
    product_id: "karakeep_monthly",
    starts_at: Date.parse("2026-01-01T00:00:00Z"),
    current_period_ends_at: Date.parse("2026-02-01T00:00:00Z"),
    gives_access: true,
    auto_renewal_status: "will_renew",
    status: "active",
    environment: "production",
    store: "app_store",
    entitlements: { items: [{ lookup_key: "pro" }] },
    ...overrides,
  };
}

function purchase(
  overrides: Partial<RevenueCatPurchase> = {},
): RevenueCatPurchase {
  return {
    product_id: "karakeep_lifetime",
    purchased_at: Date.parse("2026-01-01T00:00:00Z"),
    status: "owned",
    environment: "production",
    store: "app_store",
    entitlements: { items: [{ lookup_key: "pro" }] },
    ...overrides,
  };
}

function customer(
  overrides: Partial<RevenueCatCustomer> = {},
): RevenueCatCustomer {
  return { subscriptions: [subscription()], purchases: [], ...overrides };
}

describe("computeInAppSubscriptionState", () => {
  it("returns null when the customer never had the entitlement", () => {
    expect(
      computeInAppSubscriptionState(customer({ subscriptions: [] }), opts),
    ).toBeNull();
    expect(
      computeInAppSubscriptionState(
        customer({
          subscriptions: [
            subscription({
              entitlements: { items: [{ lookup_key: "other" }] },
            }),
          ],
        }),
        opts,
      ),
    ).toBeNull();
  });

  it("returns an active subscription", () => {
    expect(computeInAppSubscriptionState(customer(), opts)).toEqual({
      status: "active",
      store: "app_store",
      productId: "karakeep_monthly",
      cancelAtPeriodEnd: false,
      billingIssue: false,
      isSandbox: false,
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-02-01T00:00:00Z"),
    });
  });

  it("returns an expired subscription", () => {
    const state = computeInAppSubscriptionState(
      customer({
        subscriptions: [
          subscription({ gives_access: false, status: "expired" }),
        ],
      }),
      opts,
    );
    expect(state?.status).toBe("expired");
  });

  it("prefers the subscription that gives access", () => {
    const state = computeInAppSubscriptionState(
      customer({
        subscriptions: [
          subscription({
            product_id: "karakeep_yearly",
            current_period_ends_at: Date.parse("2027-01-01T00:00:00Z"),
            gives_access: false,
            status: "expired",
          }),
          subscription(),
        ],
      }),
      opts,
    );
    expect(state).toMatchObject({
      status: "active",
      productId: "karakeep_monthly",
    });
  });

  it("keeps the subscription active during a billing grace period", () => {
    const state = computeInAppSubscriptionState(
      customer({
        subscriptions: [
          subscription({ status: "in_grace_period", store: "play_store" }),
        ],
      }),
      opts,
    );
    expect(state).toMatchObject({
      status: "active",
      billingIssue: true,
      store: "play_store",
    });
  });

  it("treats a one-time purchase as a lifetime entitlement", () => {
    const state = computeInAppSubscriptionState(
      customer({ subscriptions: [], purchases: [purchase()] }),
      opts,
    );
    expect(state).toMatchObject({
      status: "active",
      store: "app_store",
      productId: "karakeep_lifetime",
      endDate: null,
    });
  });

  it("doesn't grant the entitlement for a refunded purchase", () => {
    const state = computeInAppSubscriptionState(
      customer({
        subscriptions: [],
        purchases: [purchase({ status: "refunded" })],
      }),
      opts,
    );
    expect(state?.status).toBe("expired");
  });

  it("reports a scheduled cancellation", () => {
    const state = computeInAppSubscriptionState(
      customer({
        subscriptions: [
          subscription({ auto_renewal_status: "will_not_renew" }),
        ],
      }),
      opts,
    );
    expect(state).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
  });

  it("ignores sandbox purchases when they're not allowed", () => {
    const sandboxCustomer = customer({
      subscriptions: [subscription({ environment: "sandbox" })],
    });
    expect(computeInAppSubscriptionState(sandboxCustomer, opts)).toMatchObject({
      status: "active",
      isSandbox: true,
    });
    expect(
      computeInAppSubscriptionState(sandboxCustomer, {
        ...opts,
        allowSandboxPurchases: false,
      })?.status,
    ).toBe("expired");
  });
});

describe("getRevenueCatWebhookAppUserIds", () => {
  it("collects all the affected users, without anonymous ones", () => {
    expect(
      getRevenueCatWebhookAppUserIds({
        type: "TRANSFER",
        app_user_id: "user1",
        original_app_user_id: "$RCAnonymousID:abc",
        aliases: ["user1", "$RCAnonymousID:abc"],
        transferred_from: ["user2"],
        transferred_to: ["user1"],
      }).sort(),
    ).toEqual(["user1", "user2"]);
  });
});
