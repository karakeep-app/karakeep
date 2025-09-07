import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { assets, AssetTypes, subscriptions, users } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach, getApiCaller } from "../testUtils";

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
  subscriptions: {
    update: vi.fn(),
    list: vi.fn(),
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
        webhookSecret: "whsec_123",
        isConfigured: true,
      },
      publicUrl: "https://test.karakeep.com",
      quotas: {
        free: {
          bookmarkLimit: 100,
          assetSizeBytes: 1000000, // 1MB
        },
        paid: {
          bookmarkLimit: null,
          assetSizeBytes: null,
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

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mock functions using the global mock instance
    mockCustomersCreate = mockStripeInstance.customers.create;
    mockCheckoutSessionsCreate = mockStripeInstance.checkout.sessions.create;
    mockBillingPortalSessionsCreate =
      mockStripeInstance.billingPortal.sessions.create;
    mockWebhooksConstructEvent = mockStripeInstance.webhooks.constructEvent;
    mockSubscriptionsList = mockStripeInstance.subscriptions.list;
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
        status: "active",
        startDate,
        endDate,
        hasActiveSubscription: true,
        cancelAtPeriodEnd: true,
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
        payment_method_types: ["card"],
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
        automatic_tax: {
          enabled: true,
        },
        customer_update: {
          address: "auto",
        },
        allow_promotion_codes: true,
      });
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
