import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { inAppSubscriptions, subscriptions, users } from "@karakeep/db/schema";

import type { CustomTestContext, TestDB } from "../testUtils";
import { createTestUser, defaultBeforeEach, getApiCaller } from "../testUtils";

const mockStripeInstance = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  subscriptions: { list: vi.fn() },
  webhooks: { constructEvent: vi.fn() },
}));

vi.mock("stripe", () => ({
  default: vi.fn(function () {
    return mockStripeInstance;
  }),
}));

vi.mock("@karakeep/shared/config", async (original) => {
  const mod = (await original()) as typeof import("@karakeep/shared/config");
  return {
    ...mod,
    default: {
      ...mod.default,
      stripe: {
        secretKey: "sk_test_123",
        priceId: "price_123",
        webhookSecret: "whsec_123",
        isConfigured: true,
      },
      revenueCat: {
        projectId: "proj_123",
        secretApiKey: "sk_rc_123",
        webhookAuthToken: "rc_webhook_token",
        entitlementId: "pro",
        allowSandboxPurchases: true,
        purchasePlatforms: ["ios", "android"],
        isConfigured: true,
      },
      publicUrl: "https://test.karakeep.com",
      quotas: {
        free: {
          bookmarkLimit: 100,
          assetSizeBytes: 1000000,
          browserCrawlingEnabled: false,
        },
        paid: {
          bookmarkLimit: null,
          assetSizeBytes: null,
          browserCrawlingEnabled: true,
        },
      },
    },
  };
});

const AUTH = "Bearer rc_webhook_token";
const FUTURE = "2099-01-01T00:00:00Z";
const PAST = "2020-01-01T00:00:00Z";

// RevenueCat customers keyed by app user ID, served by the mocked fetch.
// Unknown customers get a 404, like the real API.
let rcCustomers: Record<
  string,
  { subscriptions: unknown[]; purchases: unknown[] }
>;
const mockFetch = vi.fn(async (url: string | URL) => {
  const match = new URL(url).pathname.match(
    /^\/v2\/projects\/proj_123\/customers\/([^/]+)\/(subscriptions|purchases)$/,
  );
  const customer = match && rcCustomers[decodeURIComponent(match[1])];
  if (!customer) {
    return new Response(JSON.stringify({ type: "resource_missing" }), {
      status: 404,
    });
  }
  return new Response(
    JSON.stringify({
      object: "list",
      items: customer[match[2] as "subscriptions" | "purchases"],
    }),
    { status: 200 },
  );
});

function rcCustomer(endDate: string, store = "app_store") {
  const endsAt = Date.parse(endDate);
  return {
    subscriptions: [
      {
        product_id: "karakeep_monthly",
        starts_at: Date.parse("2019-12-01T00:00:00Z"),
        current_period_ends_at: endsAt,
        gives_access: endsAt > Date.now(),
        auto_renewal_status: "will_renew",
        status: endsAt > Date.now() ? "active" : "expired",
        environment: "production",
        store,
        entitlements: { items: [{ lookup_key: "pro" }] },
      },
    ],
    purchases: [],
  };
}

function webhookBody(event: Record<string, unknown>) {
  return JSON.stringify({ api_version: "1.0", event });
}

async function getQuotas(db: TestDB, userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      bookmarkQuota: true,
      storageQuota: true,
      browserCrawlingEnabled: true,
      manualTierName: true,
    },
  });
}

async function createFreeUser(db: TestDB, email = "test@test.com") {
  const user = await createTestUser(db, {
    name: "Test User",
    email,
    password: "pass1234",
  });
  await db
    .update(users)
    .set({ bookmarkQuota: 100, storageQuota: 1000000 })
    .where(eq(users.id, user.id));
  return user;
}

beforeEach<CustomTestContext>(defaultBeforeEach(false));

describe("RevenueCat subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rcCustomers = {};
    vi.stubGlobal("fetch", mockFetch);
  });

  describe("handleRevenueCatWebhook", () => {
    test<CustomTestContext>("rejects requests with an invalid authorization", async ({
      unauthedAPICaller,
    }) => {
      await expect(
        unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
          body: webhookBody({ type: "TEST", app_user_id: "x" }),
          authorization: "Bearer wrong",
        }),
      ).rejects.toThrow(/Invalid authorization/);
      await expect(
        unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
          body: webhookBody({ type: "TEST", app_user_id: "x" }),
        }),
      ).rejects.toThrow(/Invalid authorization/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test<CustomTestContext>("rejects malformed bodies", async ({
      unauthedAPICaller,
    }) => {
      await expect(
        unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
          body: "not json",
          authorization: AUTH,
        }),
      ).rejects.toThrow(/Invalid webhook body/);
    });

    test<CustomTestContext>("upgrades the user on purchase", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await createFreeUser(db);
      rcCustomers[user.id] = rcCustomer(FUTURE);

      await unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
        body: webhookBody({ type: "INITIAL_PURCHASE", app_user_id: user.id }),
        authorization: AUTH,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.revenuecat.com/v2/projects/proj_123/customers/${user.id}/subscriptions?limit=100`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer sk_rc_123",
          }),
        }),
      );
      expect(await getQuotas(db, user.id)).toEqual({
        bookmarkQuota: null,
        storageQuota: null,
        browserCrawlingEnabled: true,
        manualTierName: null,
      });

      const status = await getApiCaller(
        db,
        user.id,
      ).subscriptions.getSubscriptionStatus();
      expect(status).toEqual({
        tier: "paid",
        manualTierName: null,
        status: "active",
        startDate: new Date("2019-12-01T00:00:00Z"),
        endDate: new Date(FUTURE),
        hasActiveSubscription: true,
        paymentFailed: false,
        cancelAtPeriodEnd: false,
        provider: "in_app",
        store: "app_store",
      });
    });

    test<CustomTestContext>("downgrades the user on expiration", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await createFreeUser(db);
      rcCustomers[user.id] = rcCustomer(FUTURE);
      await unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
        body: webhookBody({ type: "INITIAL_PURCHASE", app_user_id: user.id }),
        authorization: AUTH,
      });

      rcCustomers[user.id] = rcCustomer(PAST);
      await unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
        body: webhookBody({ type: "EXPIRATION", app_user_id: user.id }),
        authorization: AUTH,
      });

      expect(await getQuotas(db, user.id)).toMatchObject({
        bookmarkQuota: 100,
        storageQuota: 1000000,
        browserCrawlingEnabled: false,
      });
      const status = await getApiCaller(
        db,
        user.id,
      ).subscriptions.getSubscriptionStatus();
      expect(status).toMatchObject({
        tier: "free",
        status: "canceled",
        hasActiveSubscription: false,
        provider: "in_app",
      });
    });

    test<CustomTestContext>("ignores anonymous and unknown users", async ({
      unauthedAPICaller,
      db,
    }) => {
      const result =
        await unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
          body: webhookBody({
            type: "INITIAL_PURCHASE",
            app_user_id: "$RCAnonymousID:abc",
            aliases: ["unknown-user"],
          }),
          authorization: AUTH,
        });

      expect(result).toEqual({ received: true });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(await db.query.inAppSubscriptions.findMany()).toHaveLength(0);
    });

    test<CustomTestContext>("doesn't create a row for users without the entitlement", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await createFreeUser(db);

      await unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
        body: webhookBody({ type: "TEST", app_user_id: user.id }),
        authorization: AUTH,
      });

      // One request for the subscriptions, one for the purchases.
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(await db.query.inAppSubscriptions.findMany()).toHaveLength(0);
    });

    test<CustomTestContext>("re-syncs both sides of a transfer", async ({
      db,
      unauthedAPICaller,
    }) => {
      const from = await createFreeUser(db, "from@test.com");
      const to = await createFreeUser(db, "to@test.com");

      rcCustomers[from.id] = rcCustomer(FUTURE);
      await unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
        body: webhookBody({ type: "INITIAL_PURCHASE", app_user_id: from.id }),
        authorization: AUTH,
      });

      // After the transfer, the entitlement belongs to the other user.
      rcCustomers[to.id] = rcCustomers[from.id];
      delete rcCustomers[from.id];
      await unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
        body: webhookBody({
          type: "TRANSFER",
          transferred_from: [from.id],
          transferred_to: [to.id],
        }),
        authorization: AUTH,
      });

      expect(await getQuotas(db, from.id)).toMatchObject({
        bookmarkQuota: 100,
      });
      expect(
        await db.query.inAppSubscriptions.findFirst({
          where: eq(inAppSubscriptions.userId, from.id),
        }),
      ).toMatchObject({ status: "expired" });
      expect(await getQuotas(db, to.id)).toMatchObject({
        bookmarkQuota: null,
      });
    });

    test<CustomTestContext>("returns an error when RevenueCat is unreachable so it retries", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await createFreeUser(db);
      mockFetch.mockResolvedValueOnce(new Response("boom", { status: 500 }));

      await expect(
        unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
          body: webhookBody({ type: "RENEWAL", app_user_id: user.id }),
          authorization: AUTH,
        }),
      ).rejects.toThrow(/Internal server error/);
    });
  });

  describe("syncWithRevenueCat", () => {
    test<CustomTestContext>("syncs the current user", async ({ db }) => {
      const user = await createFreeUser(db);
      rcCustomers[user.id] = rcCustomer(FUTURE, "play_store");

      expect(
        await getApiCaller(db, user.id).subscriptions.syncWithRevenueCat(),
      ).toEqual({ success: true, hasActiveSubscription: true });

      expect(
        await db.query.inAppSubscriptions.findFirst({
          where: eq(inAppSubscriptions.userId, user.id),
        }),
      ).toMatchObject({ status: "active", store: "play_store" });
      expect(await getQuotas(db, user.id)).toMatchObject({
        bookmarkQuota: null,
      });
    });

    test<CustomTestContext>("reports when the sync found no active subscription", async ({
      db,
    }) => {
      const user = await createFreeUser(db);
      rcCustomers[user.id] = rcCustomer(PAST);

      expect(
        await getApiCaller(db, user.id).subscriptions.syncWithRevenueCat(),
      ).toEqual({ success: true, hasActiveSubscription: false });
    });

    test<CustomTestContext>("flags billing issues of active in-app subscriptions", async ({
      db,
    }) => {
      const user = await createFreeUser(db);
      const customer = rcCustomer(FUTURE);
      customer.subscriptions[0].status = "in_grace_period";
      rcCustomers[user.id] = customer;
      const caller = getApiCaller(db, user.id);
      await caller.subscriptions.syncWithRevenueCat();

      expect(await caller.subscriptions.getSubscriptionStatus()).toMatchObject({
        tier: "paid",
        status: "past_due",
        hasActiveSubscription: true,
        paymentFailed: true,
        provider: "in_app",
      });
    });

    test<CustomTestContext>("overlapping syncs apply the newest state and share a fetch", async ({
      db,
    }) => {
      const user = await createFreeUser(db);
      const caller = getApiCaller(db, user.id);

      // Hold the first sync's (stale) RevenueCat responses until the user's
      // state changes and more syncs come in.
      let releaseFirstSync!: () => void;
      const firstSyncGate = new Promise<void>((resolve) => {
        releaseFirstSync = resolve;
      });
      const defaultFetch = mockFetch.getMockImplementation()!;
      const delayedFetch = async (url: string | URL) => {
        const response = await defaultFetch(url);
        await firstSyncGate;
        return response;
      };
      mockFetch
        .mockImplementationOnce(delayedFetch)
        .mockImplementationOnce(delayedFetch);

      rcCustomers[user.id] = rcCustomer(PAST);
      const first = caller.subscriptions.syncWithRevenueCat();
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

      rcCustomers[user.id] = rcCustomer(FUTURE);
      const later = [
        caller.subscriptions.syncWithRevenueCat(),
        caller.subscriptions.syncWithRevenueCat(),
      ];
      releaseFirstSync();
      await Promise.all([first, ...later]);

      expect(
        await db.query.inAppSubscriptions.findFirst({
          where: eq(inAppSubscriptions.userId, user.id),
        }),
      ).toMatchObject({ status: "active" });
      expect(await getQuotas(db, user.id)).toMatchObject({
        bookmarkQuota: null,
      });
      // The first sync, then a single sync shared by the two later calls.
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe("interaction with other tiers", () => {
    test<CustomTestContext>("in-app expiry doesn't downgrade an active Stripe subscriber", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await createFreeUser(db);
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        status: "active",
        tier: "paid",
      });
      rcCustomers[user.id] = rcCustomer(PAST);

      await unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
        body: webhookBody({ type: "EXPIRATION", app_user_id: user.id }),
        authorization: AUTH,
      });

      expect(await getQuotas(db, user.id)).toMatchObject({
        bookmarkQuota: null,
        storageQuota: null,
      });
      const status = await getApiCaller(
        db,
        user.id,
      ).subscriptions.getSubscriptionStatus();
      expect(status).toMatchObject({ tier: "paid", provider: "stripe" });
    });

    test<CustomTestContext>("Stripe cancellation doesn't downgrade an active in-app subscriber", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await createFreeUser(db);
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        status: "active",
        tier: "paid",
      });
      rcCustomers[user.id] = rcCustomer(FUTURE);
      await getApiCaller(db, user.id).subscriptions.syncWithRevenueCat();

      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: { object: { customer: "cus_123" } },
      });
      mockStripeInstance.subscriptions.list.mockResolvedValue({ data: [] });
      await unauthedAPICaller.subscriptions.handleWebhook({
        body: "body",
        signature: "sig",
      });

      expect(await getQuotas(db, user.id)).toMatchObject({
        bookmarkQuota: null,
        storageQuota: null,
      });
      const status = await getApiCaller(
        db,
        user.id,
      ).subscriptions.getSubscriptionStatus();
      expect(status).toMatchObject({ tier: "paid", provider: "in_app" });
    });

    test<CustomTestContext>("in-app expiry keeps a manually granted tier", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await createFreeUser(db);
      await db
        .update(users)
        .set({ manualTierName: "Acme", bookmarkQuota: 5000 })
        .where(eq(users.id, user.id));
      rcCustomers[user.id] = rcCustomer(PAST);
      await db.insert(inAppSubscriptions).values({
        userId: user.id,
        status: "active",
      });

      await unauthedAPICaller.subscriptions.handleRevenueCatWebhook({
        body: webhookBody({ type: "EXPIRATION", app_user_id: user.id }),
        authorization: AUTH,
      });

      expect(await getQuotas(db, user.id)).toMatchObject({
        manualTierName: "Acme",
        bookmarkQuota: 5000,
      });
    });

    test<CustomTestContext>("blocks Stripe checkout for active in-app subscribers", async ({
      db,
    }) => {
      const user = await createFreeUser(db);
      rcCustomers[user.id] = rcCustomer(FUTURE);
      const caller = getApiCaller(db, user.id);
      await caller.subscriptions.syncWithRevenueCat();

      await expect(
        caller.subscriptions.createCheckoutSession({}),
      ).rejects.toThrow(/through the mobile app/);
      expect(mockStripeInstance.customers.create).not.toHaveBeenCalled();
    });

    test<CustomTestContext>("blocks granting a manual tier to active in-app subscribers", async ({
      db,
    }) => {
      const user = await createFreeUser(db);
      const admin = await createTestUser(db, {
        name: "Admin",
        email: "admin@test.com",
        password: "pass1234",
        role: "admin",
      });
      rcCustomers[user.id] = rcCustomer(FUTURE);
      await getApiCaller(db, user.id).subscriptions.syncWithRevenueCat();

      await expect(
        getApiCaller(
          db,
          admin.id,
          admin.email,
          "admin",
        ).subscriptions.updateSubscriptionTier({
          email: user.email,
          manualTierName: "Acme",
        }),
      ).rejects.toThrow(/active in-app subscription/);
    });

    test<CustomTestContext>("removing a manual tier keeps an active in-app subscriber paid", async ({
      db,
    }) => {
      const user = await createFreeUser(db);
      const admin = await createTestUser(db, {
        name: "Admin",
        email: "admin@test.com",
        password: "pass1234",
        role: "admin",
      });
      rcCustomers[user.id] = rcCustomer(FUTURE);
      await getApiCaller(db, user.id).subscriptions.syncWithRevenueCat();

      await getApiCaller(
        db,
        admin.id,
        admin.email,
        "admin",
      ).subscriptions.updateSubscriptionTier({
        email: user.email,
        manualTierName: null,
      });

      expect(await getQuotas(db, user.id)).toEqual({
        bookmarkQuota: null,
        storageQuota: null,
        browserCrawlingEnabled: true,
        manualTierName: null,
      });
    });
  });
});
