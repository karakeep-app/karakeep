import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { assets, AssetTypes, subscriptions, users } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import serverConfig from "@karakeep/shared/config";

import type { CustomTestContext } from "../testUtils";
import {
  defaultBeforeEach,
  getApiCaller,
  getApiKeyCallerForPlainKey,
} from "../testUtils";

// Mock Stripe using vi.hoisted to ensure it's available during module initialization
const mockStripeInstance = vi.hoisted(() => ({
  customers: {
    create: vi.fn(),
  },
  checkout: {
    sessions: {
      create: vi.fn(),
    },
  },
  billingPortal: {
    sessions: {
      create: vi.fn(),
    },
  },
  prices: {
    retrieve: vi.fn(),
  },
  subscriptions: {
    update: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
}));

vi.mock("stripe", () => {
  return {
    default: vi.fn(() => mockStripeInstance),
  };
});

// Mock server config with Stripe settings
vi.mock("@karakeep/shared/config", async (original) => {
  const mod = (await original()) as typeof import("@karakeep/shared/config");
  return {
    ...mod,
    default: {
      ...mod.default,
      stripe: {
        secretKey: "sk_test_123",
        priceId: "price_123",
        yearlyPriceId: "price_yearly_123",
        webhookSecret: "whsec_123",
        isConfigured: true,
      },
      publicUrl: "https://test.karakeep.com",
      quotas: {
        free: {
          bookmarkLimit: 100,
          assetSizeBytes: 1000000, // 1MB
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

beforeEach<CustomTestContext>(defaultBeforeEach(false));

describe("Subscription Routes", () => {
  let mockCustomersCreate: ReturnType<typeof vi.fn>;
  let mockCheckoutSessionsCreate: ReturnType<typeof vi.fn>;
  let mockBillingPortalSessionsCreate: ReturnType<typeof vi.fn>;
  let mockWebhooksConstructEvent: ReturnType<typeof vi.fn>;
  let mockSubscriptionsList: ReturnType<typeof vi.fn>;
  let mockPricesRetrieve: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mock functions using the global mock instance
    mockCustomersCreate = mockStripeInstance.customers.create;
    mockCheckoutSessionsCreate = mockStripeInstance.checkout.sessions.create;
    mockBillingPortalSessionsCreate =
      mockStripeInstance.billingPortal.sessions.create;
    mockWebhooksConstructEvent = mockStripeInstance.webhooks.constructEvent;
    mockSubscriptionsList = mockStripeInstance.subscriptions.list;
    mockPricesRetrieve = mockStripeInstance.prices.retrieve;
  });

  describe("getSubscriptionStatus", () => {
    test<CustomTestContext>("returns free tier when no subscription exists", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id);

      const status = await caller.subscriptions.getSubscriptionStatus();

      expect(status).toEqual({
        tier: "free",
        manualTierName: null,
        status: null,
        startDate: null,
        endDate: null,
        hasActiveSubscription: false,
        cancelAtPeriodEnd: false,
      });
    });

    test<CustomTestContext>("returns subscription data when subscription exists", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id);

      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-02-01");

      // Create subscription record
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        status: "active",
        tier: "paid",
        startDate,
        endDate,
        cancelAtPeriodEnd: true,
      });

      const status = await caller.subscriptions.getSubscriptionStatus();

      expect(status).toEqual({
        tier: "paid",
        manualTierName: null,
        status: "active",
        startDate,
        endDate,
        hasActiveSubscription: true,
        cancelAtPeriodEnd: true,
      });
    });
  });

  describe("manual tier", () => {
    test<CustomTestContext>("getSubscriptionStatus returns custom tier when manualTierName is set", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id);

      await db
        .update(users)
        .set({ manualTierName: "Acme" })
        .where(eq(users.id, user.id));

      const status = await caller.subscriptions.getSubscriptionStatus();

      expect(status).toEqual({
        tier: "custom",
        manualTierName: "Acme",
        status: null,
        startDate: null,
        endDate: null,
        hasActiveSubscription: false,
        cancelAtPeriodEnd: false,
      });
    });

    test<CustomTestContext>("getSubscriptionStatus returns custom tier over an inactive subscription", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id);

      await db
        .update(users)
        .set({ manualTierName: "Acme" })
        .where(eq(users.id, user.id));

      // e.g. an abandoned checkout created a Stripe customer earlier
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        status: "unpaid",
        tier: "free",
      });

      const status = await caller.subscriptions.getSubscriptionStatus();

      expect(status.tier).toBe("custom");
      expect(status.manualTierName).toBe("Acme");
      expect(status.hasActiveSubscription).toBe(false);
    });

    test<CustomTestContext>("sync doesn't downgrade a manual tier user with no Stripe subscriptions", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      // Manually granted tier with custom quotas
      await db
        .update(users)
        .set({
          manualTierName: "Acme",
          bookmarkQuota: 500,
          storageQuota: 5000000,
        })
        .where(eq(users.id, user.id));

      // An abandoned checkout created a Stripe customer with no subscriptions
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        status: "unpaid",
        tier: "free",
      });

      mockSubscriptionsList.mockResolvedValue({
        data: [],
      });

      mockWebhooksConstructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
          },
        },
      });

      const result = await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      expect(result).toEqual({ received: true });

      const subscription = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, user.id),
      });
      expect(subscription?.status).toBe("unpaid");

      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: {
          bookmarkQuota: true,
          storageQuota: true,
          manualTierName: true,
        },
      });
      expect(updatedUser?.manualTierName).toBe("Acme");
      expect(updatedUser?.bookmarkQuota).toBe(500);
      expect(updatedUser?.storageQuota).toBe(5000000);
    });

    test<CustomTestContext>("sync doesn't downgrade a manual tier user with only inactive Stripe subscriptions", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      await db
        .update(users)
        .set({
          manualTierName: "Acme",
          bookmarkQuota: 500,
          storageQuota: 5000000,
        })
        .where(eq(users.id, user.id));

      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        status: "unpaid",
        tier: "free",
      });

      mockSubscriptionsList.mockResolvedValue({
        data: [
          {
            id: "sub_123",
            status: "canceled",
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  price: { id: "price_123" },
                  current_period_start: 1640995200,
                  current_period_end: 1643673600,
                },
              ],
            },
          },
        ],
      });

      mockWebhooksConstructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
          },
        },
      });

      const result = await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      expect(result).toEqual({ received: true });

      const subscription = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, user.id),
      });
      expect(subscription?.status).toBe("unpaid");
      expect(subscription?.stripeSubscriptionId).toBeNull();

      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: {
          bookmarkQuota: true,
          storageQuota: true,
          manualTierName: true,
        },
      });
      expect(updatedUser?.manualTierName).toBe("Acme");
      expect(updatedUser?.bookmarkQuota).toBe(500);
      expect(updatedUser?.storageQuota).toBe(5000000);
    });

    test<CustomTestContext>("an active Stripe subscription supersedes and clears the manual tier", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      await db
        .update(users)
        .set({
          manualTierName: "Acme",
          bookmarkQuota: 500,
          storageQuota: 5000000,
        })
        .where(eq(users.id, user.id));

      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        status: "unpaid",
        tier: "free",
      });

      mockSubscriptionsList.mockResolvedValue({
        data: [
          {
            id: "sub_123",
            status: "active",
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  price: { id: "price_123" },
                  current_period_start: 1640995200,
                  current_period_end: 1643673600,
                },
              ],
            },
          },
        ],
      });

      mockWebhooksConstructEvent.mockReturnValue({
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
          },
        },
      });

      const result = await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      expect(result).toEqual({ received: true });

      const subscription = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, user.id),
      });
      expect(subscription?.status).toBe("active");
      expect(subscription?.tier).toBe("paid");
      expect(subscription?.stripeSubscriptionId).toBe("sub_123");

      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: {
          bookmarkQuota: true,
          storageQuota: true,
          manualTierName: true,
        },
      });
      expect(updatedUser?.manualTierName).toBeNull();
      expect(updatedUser?.bookmarkQuota).toBeNull(); // unlimited for paid
      expect(updatedUser?.storageQuota).toBeNull(); // unlimited for paid
    });
  });

  describe("updateSubscriptionTier", () => {
    async function createAdminCaller(db: CustomTestContext["db"]) {
      const [adminUser] = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "admin-tier@test.com",
          role: "admin",
        })
        .returning();
      return getApiCaller(db, adminUser.id, adminUser.email, "admin");
    }

    test<CustomTestContext>("admin can grant and revoke a manual tier by email", async ({
      db,
      unauthedAPICaller,
    }) => {
      const adminApi = await createAdminCaller(db);
      const targetUser = await unauthedAPICaller.users.create({
        name: "Target User",
        email: "target-tier@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      await adminApi.subscriptions.updateSubscriptionTier({
        email: "target-tier@test.com",
        manualTierName: "Acme",
        bookmarkQuota: 500,
        storageQuota: 5000000,
        browserCrawlingEnabled: true,
      });

      let user = await db.query.users.findFirst({
        where: eq(users.id, targetUser.id),
        columns: {
          manualTierName: true,
          bookmarkQuota: true,
          storageQuota: true,
          browserCrawlingEnabled: true,
        },
      });
      expect(user?.manualTierName).toBe("Acme");
      expect(user?.bookmarkQuota).toBe(500);
      expect(user?.storageQuota).toBe(5000000);
      expect(user?.browserCrawlingEnabled).toBe(true);

      await adminApi.subscriptions.updateSubscriptionTier({
        email: "target-tier@test.com",
        manualTierName: null,
      });

      user = await db.query.users.findFirst({
        where: eq(users.id, targetUser.id),
        columns: {
          manualTierName: true,
          bookmarkQuota: true,
          storageQuota: true,
          browserCrawlingEnabled: true,
        },
      });
      expect(user?.manualTierName).toBeNull();
      expect(user?.bookmarkQuota).toBe(100);
      expect(user?.storageQuota).toBe(1000000);
      expect(user?.browserCrawlingEnabled).toBe(false);

      const nonAdminCaller = getApiCaller(db, targetUser.id);
      await expect(
        nonAdminCaller.subscriptions.updateSubscriptionTier({
          email: "target-tier@test.com",
          manualTierName: "Acme",
        }),
      ).rejects.toThrow(/FORBIDDEN/);
    });

    test<CustomTestContext>("fails for unknown emails and actively subscribed users", async ({
      db,
      unauthedAPICaller,
    }) => {
      const adminApi = await createAdminCaller(db);

      await expect(
        adminApi.subscriptions.updateSubscriptionTier({
          email: "missing@test.com",
          manualTierName: "Acme",
        }),
      ).rejects.toThrow(/User not found/);

      const subscribedUser = await unauthedAPICaller.users.create({
        name: "Subscribed User",
        email: "subscribed@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      await db.insert(subscriptions).values({
        userId: subscribedUser.id,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        status: "active",
        tier: "paid",
      });

      await expect(
        adminApi.subscriptions.updateSubscriptionTier({
          email: "subscribed@test.com",
          manualTierName: "Acme",
        }),
      ).rejects.toThrow(/User already has an active Stripe subscription/);

      // Revoking is still allowed for actively subscribed users.
      await adminApi.subscriptions.updateSubscriptionTier({
        email: "subscribed@test.com",
        manualTierName: null,
      });
    });

    test<CustomTestContext>("requires a verified email when verification is enabled", async ({
      db,
      unauthedAPICaller,
    }) => {
      const adminApi = await createAdminCaller(db);
      const targetUser = await unauthedAPICaller.users.create({
        name: "Target User",
        email: "target-tier@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      const originalValue = serverConfig.auth.emailVerificationRequired;
      serverConfig.auth.emailVerificationRequired = true;
      try {
        await expect(
          adminApi.subscriptions.updateSubscriptionTier({
            email: "target-tier@test.com",
            manualTierName: "Acme",
          }),
        ).rejects.toThrow(/User email is not verified/);

        // Revoking doesn't require a verified email.
        await adminApi.subscriptions.updateSubscriptionTier({
          email: "target-tier@test.com",
          manualTierName: null,
        });

        await db
          .update(users)
          .set({ emailVerified: new Date() })
          .where(eq(users.id, targetUser.id));

        await adminApi.subscriptions.updateSubscriptionTier({
          email: "target-tier@test.com",
          manualTierName: "Acme",
        });
      } finally {
        serverConfig.auth.emailVerificationRequired = originalValue;
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, targetUser.id),
        columns: {
          manualTierName: true,
        },
      });
      expect(user?.manualTierName).toBe("Acme");
    });

    test<CustomTestContext>("requires the admin:subscriptions scope for API keys", async ({
      db,
      unauthedAPICaller,
    }) => {
      const adminApi = await createAdminCaller(db);
      await unauthedAPICaller.users.create({
        name: "Target User",
        email: "target-tier@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      const usersScopedKey = await adminApi.apiKeys.create({
        name: "Admin Users Key",
        scopes: ["admin:users:readwrite"],
      });
      const usersScopedCaller = await getApiKeyCallerForPlainKey(
        db,
        usersScopedKey.key,
      );
      await expect(
        usersScopedCaller.subscriptions.updateSubscriptionTier({
          email: "target-tier@test.com",
          manualTierName: "Acme",
        }),
      ).rejects.toThrow(/admin:subscriptions:readwrite/);

      const subscriptionsScopedKey = await adminApi.apiKeys.create({
        name: "Admin Subscriptions Key",
        scopes: ["admin:subscriptions:readwrite"],
      });
      const subscriptionsScopedCaller = await getApiKeyCallerForPlainKey(
        db,
        subscriptionsScopedKey.key,
      );
      await subscriptionsScopedCaller.subscriptions.updateSubscriptionTier({
        email: "target-tier@test.com",
        manualTierName: "Acme",
      });
    });
  });

  describe("getSubscriptionPrice", () => {
    test<CustomTestContext>("returns monthly and yearly prices", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id);

      mockPricesRetrieve
        .mockResolvedValueOnce({
          id: "price_123",
          currency: "usd",
          unit_amount: 400,
        })
        .mockResolvedValueOnce({
          id: "price_yearly_123",
          currency: "usd",
          unit_amount: 4000,
        });

      const result = await caller.subscriptions.getSubscriptionPrice();

      expect(result).toEqual({
        monthly: {
          priceId: "price_123",
          currency: "usd",
          amount: 400,
        },
        yearly: {
          priceId: "price_yearly_123",
          currency: "usd",
          amount: 4000,
        },
      });
    });
  });

  describe("createCheckoutSession", () => {
    test<CustomTestContext>("creates checkout session for new customer", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id);

      mockCustomersCreate.mockResolvedValue({
        id: "cus_new123",
      });

      mockCheckoutSessionsCreate.mockResolvedValue({
        id: "cs_123",
        url: "https://checkout.stripe.com/pay/cs_123",
      });

      const result = await caller.subscriptions.createCheckoutSession();

      expect(result).toEqual({
        sessionId: "cs_123",
        url: "https://checkout.stripe.com/pay/cs_123",
      });

      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: "test@test.com",
        metadata: {
          userId: user.id,
        },
      });

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith({
        customer: "cus_new123",
        line_items: [
          {
            price: "price_123",
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url:
          "https://test.karakeep.com/settings/subscription?success=true",
        cancel_url:
          "https://test.karakeep.com/settings/subscription?canceled=true",
        metadata: {
          userId: user.id,
        },
        customer_update: {
          address: "auto",
        },
        allow_promotion_codes: true,
        managed_payments: {
          enabled: true,
        },
      });
    });

    test<CustomTestContext>("creates checkout session with yearly price when billingPeriod is yearly", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id);

      mockCustomersCreate.mockResolvedValue({
        id: "cus_new123",
      });

      mockCheckoutSessionsCreate.mockResolvedValue({
        id: "cs_123",
        url: "https://checkout.stripe.com/pay/cs_123",
      });

      const result = await caller.subscriptions.createCheckoutSession({
        billingPeriod: "yearly",
      });

      expect(result).toEqual({
        sessionId: "cs_123",
        url: "https://checkout.stripe.com/pay/cs_123",
      });

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            {
              price: "price_yearly_123",
              quantity: 1,
            },
          ],
        }),
      );
    });

    test<CustomTestContext>("throws error if user already has active subscription", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id);

      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        status: "active",
        tier: "paid",
      });

      await expect(
        caller.subscriptions.createCheckoutSession(),
      ).rejects.toThrow(/User already has an active subscription/);
    });
  });

  describe("createPortalSession", () => {
    test<CustomTestContext>("creates portal session for user with subscription", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id);

      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        status: "active",
        tier: "paid",
      });

      mockBillingPortalSessionsCreate.mockResolvedValue({
        url: "https://billing.stripe.com/session/123",
      });

      const result = await caller.subscriptions.createPortalSession();

      expect(result).toEqual({
        url: "https://billing.stripe.com/session/123",
      });

      expect(mockBillingPortalSessionsCreate).toHaveBeenCalledWith({
        customer: "cus_123",
        return_url: "https://test.karakeep.com/settings/subscription",
      });
    });

    test<CustomTestContext>("throws error if user has no subscription", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id);

      await expect(caller.subscriptions.createPortalSession()).rejects.toThrow(
        /No Stripe customer found/,
      );
    });
  });

  describe("getQuotaUsage", () => {
    test<CustomTestContext>("returns quota usage for user with no data", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id);

      const usage = await caller.subscriptions.getQuotaUsage();

      expect(usage).toEqual({
        bookmarks: {
          used: 0,
          quota: 100,
          unlimited: false,
        },
        storage: {
          used: 0,
          quota: 1000000,
          unlimited: false,
        },
      });
    });

    test<CustomTestContext>("returns quota usage with bookmarks and assets", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id);

      // Set user quotas
      await db
        .update(users)
        .set({
          bookmarkQuota: 100,
          storageQuota: 1000000, // 1MB
        })
        .where(eq(users.id, user.id));

      // Create test bookmarks
      const bookmark1 = await caller.bookmarks.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });

      const bookmark2 = await caller.bookmarks.createBookmark({
        text: "Test note",
        type: BookmarkTypes.TEXT,
      });

      // Create test assets
      await db.insert(assets).values([
        {
          id: "asset1",
          assetType: AssetTypes.LINK_SCREENSHOT,
          size: 50000, // 50KB
          contentType: "image/png",
          bookmarkId: bookmark1.id,
          userId: user.id,
        },
        {
          id: "asset2",
          assetType: AssetTypes.LINK_BANNER_IMAGE,
          size: 75000, // 75KB
          contentType: "image/jpeg",
          bookmarkId: bookmark2.id,
          userId: user.id,
        },
      ]);

      const usage = await caller.subscriptions.getQuotaUsage();

      expect(usage).toEqual({
        bookmarks: {
          used: 2,
          quota: 100,
          unlimited: false,
        },
        storage: {
          used: 125000, // 50KB + 75KB
          quota: 1000000,
          unlimited: false,
        },
      });
    });
  });

  describe("handleWebhook", () => {
    test<CustomTestContext>("handles customer.subscription.created event", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      // Create existing subscription record
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        status: "unpaid",
        tier: "free",
      });

      const mockEvent = {
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            current_period_start: 1640995200, // 2022-01-01
            current_period_end: 1643673600, // 2022-02-01
            metadata: {
              userId: user.id,
            },
          },
        },
      };

      // Mock the Stripe subscriptions.list response
      mockSubscriptionsList.mockResolvedValue({
        data: [
          {
            id: "sub_123",
            status: "active",
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  price: { id: "price_123" },
                  current_period_start: 1640995200,
                  current_period_end: 1643673600,
                },
              ],
            },
          },
        ],
      });

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const result = await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      expect(result).toEqual({ received: true });

      // Verify subscription was updated
      const subscription = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, user.id),
      });

      expect(subscription).toBeTruthy();
      expect(subscription?.stripeCustomerId).toBe("cus_123");
      expect(subscription?.stripeSubscriptionId).toBe("sub_123");
      expect(subscription?.status).toBe("active");
      expect(subscription?.tier).toBe("paid");
    });

    test<CustomTestContext>("handles customer.subscription.updated event", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      // Create existing subscription
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        status: "active",
        tier: "paid",
      });

      const mockEvent = {
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "past_due",
            current_period_start: 1640995200,
            current_period_end: 1643673600,
            metadata: {
              userId: user.id,
            },
          },
        },
      };

      // Mock the Stripe subscriptions.list response
      mockSubscriptionsList.mockResolvedValue({
        data: [
          {
            id: "sub_123",
            status: "past_due",
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  price: { id: "price_123" },
                  current_period_start: 1640995200,
                  current_period_end: 1643673600,
                },
              ],
            },
          },
        ],
      });

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const result = await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      expect(result).toEqual({ received: true });

      // Verify subscription was updated
      const subscription = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, user.id),
      });

      expect(subscription?.status).toBe("past_due");
      expect(subscription?.tier).toBe("free"); // past_due status should set tier to free
    });

    test<CustomTestContext>("handles customer.subscription.deleted event", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      // Create existing subscription
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        status: "active",
        tier: "paid",
      });

      const mockEvent = {
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            metadata: {
              userId: user.id,
            },
          },
        },
      };

      // Mock the Stripe subscriptions.list response for deleted subscription (empty list)
      mockSubscriptionsList.mockResolvedValue({
        data: [],
      });

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const result = await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      expect(result).toEqual({ received: true });

      // Verify subscription was updated to canceled state
      const subscription = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, user.id),
      });

      expect(subscription).toBeTruthy();
      expect(subscription?.status).toBe("canceled");
      expect(subscription?.tier).toBe("free");
      expect(subscription?.stripeSubscriptionId).toBeNull();
      expect(subscription?.priceId).toBeNull();
      expect(subscription?.cancelAtPeriodEnd).toBe(false);
      expect(subscription?.startDate).toBeNull();
      expect(subscription?.endDate).toBeNull();
    });

    test<CustomTestContext>("keeps the active yearly plan when the old monthly subscription is deleted", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      // User has already upgraded to yearly; the active yearly subscription is
      // what's currently recorded.
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_yearly",
        status: "active",
        tier: "paid",
        priceId: "price_yearly_123",
      });

      // The old monthly subscription finally expires and fires a deleted event.
      const mockEvent = {
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_monthly",
            customer: "cus_123",
            metadata: {
              userId: user.id,
            },
          },
        },
      };

      // Stripe still has both subscriptions: the just-canceled monthly one
      // (listed first) and the active yearly one. A naive data[0] would pick
      // the canceled monthly sub and wrongly downgrade the user to free.
      mockSubscriptionsList.mockResolvedValue({
        data: [
          {
            id: "sub_monthly",
            status: "canceled",
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  price: { id: "price_123" },
                  current_period_start: 1640995200, // 2022-01-01
                  current_period_end: 1643673600, // 2022-02-01
                },
              ],
            },
          },
          {
            id: "sub_yearly",
            status: "active",
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  price: { id: "price_yearly_123" },
                  current_period_start: 1640995200, // 2022-01-01
                  current_period_end: 1672531200, // 2023-01-01
                },
              ],
            },
          },
        ],
      });

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const result = await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      expect(result).toEqual({ received: true });

      const subscription = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, user.id),
      });

      // The user stays on the active yearly plan rather than being downgraded.
      expect(subscription?.status).toBe("active");
      expect(subscription?.tier).toBe("paid");
      expect(subscription?.stripeSubscriptionId).toBe("sub_yearly");
      expect(subscription?.priceId).toBe("price_yearly_123");
      expect(subscription?.endDate).toEqual(new Date(1672531200 * 1000));
    });

    test<CustomTestContext>("selects the active subscription with the latest end date when multiple overlap", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_monthly",
        status: "active",
        tier: "paid",
        priceId: "price_123",
      });

      const mockEvent = {
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_yearly",
            customer: "cus_123",
            metadata: {
              userId: user.id,
            },
          },
        },
      };

      // Both subscriptions are still active during the upgrade overlap. The
      // monthly one is listed first, but the yearly one extends further into
      // the future and should win.
      mockSubscriptionsList.mockResolvedValue({
        data: [
          {
            id: "sub_monthly",
            status: "active",
            cancel_at_period_end: true,
            items: {
              data: [
                {
                  price: { id: "price_123" },
                  current_period_start: 1640995200, // 2022-01-01
                  current_period_end: 1643673600, // 2022-02-01
                },
              ],
            },
          },
          {
            id: "sub_yearly",
            status: "active",
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  price: { id: "price_yearly_123" },
                  current_period_start: 1640995200, // 2022-01-01
                  current_period_end: 1672531200, // 2023-01-01
                },
              ],
            },
          },
        ],
      });

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      const subscription = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, user.id),
      });

      expect(subscription?.stripeSubscriptionId).toBe("sub_yearly");
      expect(subscription?.priceId).toBe("price_yearly_123");
      expect(subscription?.cancelAtPeriodEnd).toBe(false);
      expect(subscription?.endDate).toEqual(new Date(1672531200 * 1000));
    });

    test<CustomTestContext>("acknowledges webhook for unknown Stripe customer", async ({
      unauthedAPICaller,
    }) => {
      const mockEvent = {
        type: "payment_intent.succeeded",
        data: {
          object: {
            customer: "cus_deleted_user",
          },
        },
      };

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const result = await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      expect(result).toEqual({ received: true });
      expect(mockSubscriptionsList).not.toHaveBeenCalled();
    });

    test<CustomTestContext>("handles unknown webhook event type", async ({
      unauthedAPICaller,
    }) => {
      const mockEvent = {
        type: "unknown.event.type",
        data: {
          object: {},
        },
      };

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const result = await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      expect(result).toEqual({ received: true });
    });

    test<CustomTestContext>("handles invalid webhook signature", async ({
      unauthedAPICaller,
    }) => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      await expect(
        unauthedAPICaller.subscriptions.handleWebhook({
          body: "webhook-body",
          signature: "invalid-signature",
        }),
      ).rejects.toThrow(/Invalid signature/);
    });
  });

  describe("quota updates on tier changes", () => {
    test<CustomTestContext>("updates quotas to paid limits on tier promotion", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      // Set initial free tier quotas
      await db
        .update(users)
        .set({
          bookmarkQuota: 100,
          storageQuota: 1000000, // 1MB
        })
        .where(eq(users.id, user.id));

      // Create subscription record
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        status: "unpaid",
        tier: "free",
      });

      const mockEvent = {
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            current_period_start: 1640995200,
            current_period_end: 1643673600,
            metadata: {
              userId: user.id,
            },
          },
        },
      };

      // Mock the Stripe subscriptions.list response
      mockSubscriptionsList.mockResolvedValue({
        data: [
          {
            id: "sub_123",
            status: "active",
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  price: { id: "price_123" },
                  current_period_start: 1640995200,
                  current_period_end: 1643673600,
                },
              ],
            },
          },
        ],
      });

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      // Verify user quotas were updated to paid limits
      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: {
          bookmarkQuota: true,
          storageQuota: true,
        },
      });

      expect(updatedUser?.bookmarkQuota).toBeNull(); // unlimited for paid
      expect(updatedUser?.storageQuota).toBeNull(); // unlimited for paid
    });

    test<CustomTestContext>("updates quotas to free limits on tier demotion", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      // Set initial paid tier quotas (unlimited)
      await db
        .update(users)
        .set({
          bookmarkQuota: null,
          storageQuota: null,
        })
        .where(eq(users.id, user.id));

      // Create active subscription
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        status: "active",
        tier: "paid",
      });

      const mockEvent = {
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "past_due",
            current_period_start: 1640995200,
            current_period_end: 1643673600,
            metadata: {
              userId: user.id,
            },
          },
        },
      };

      // Mock the Stripe subscriptions.list response for past_due status
      mockSubscriptionsList.mockResolvedValue({
        data: [
          {
            id: "sub_123",
            status: "past_due",
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  price: { id: "price_123" },
                  current_period_start: 1640995200,
                  current_period_end: 1643673600,
                },
              ],
            },
          },
        ],
      });

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      // Verify user quotas were updated to free limits
      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: {
          bookmarkQuota: true,
          storageQuota: true,
        },
      });

      expect(updatedUser?.bookmarkQuota).toBe(100); // free tier limit
      expect(updatedUser?.storageQuota).toBe(1000000); // free tier limit (1MB)
    });

    test<CustomTestContext>("updates quotas to free limits on subscription cancellation", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      // Set initial paid tier quotas (unlimited)
      await db
        .update(users)
        .set({
          bookmarkQuota: null,
          storageQuota: null,
        })
        .where(eq(users.id, user.id));

      // Create active subscription
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        status: "active",
        tier: "paid",
      });

      const mockEvent = {
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            metadata: {
              userId: user.id,
            },
          },
        },
      };

      // Mock the Stripe subscriptions.list response for deleted subscription (empty list)
      mockSubscriptionsList.mockResolvedValue({
        data: [],
      });

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      await unauthedAPICaller.subscriptions.handleWebhook({
        body: "webhook-body",
        signature: "webhook-signature",
      });

      // Verify user quotas were updated to free limits
      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: {
          bookmarkQuota: true,
          storageQuota: true,
        },
      });

      expect(updatedUser?.bookmarkQuota).toBe(100); // free tier limit
      expect(updatedUser?.storageQuota).toBe(1000000); // free tier limit (1MB)
    });
  });
});
