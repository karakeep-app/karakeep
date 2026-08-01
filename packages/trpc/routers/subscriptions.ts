// Thanks to @t3dotgg for the recommendations (https://github.com/t3dotgg/stripe-recommendations)!

import { TRPCError } from "@trpc/server";
import { count, eq, sum } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";

import { assets, bookmarks, subscriptions, users } from "@karakeep/db/schema";
import { addLogFields, withEventLog } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";

import {
  Context,
  createAdminScopedProcedure,
  createEventLogMiddleware,
  publicProcedure,
  router,
  createScopedAuthedProcedure,
} from "../index";

const stripe = serverConfig.stripe.secretKey
  ? new Stripe(serverConfig.stripe.secretKey, {
      // @ts-expect-error overrides the pinned API version
      apiVersion: "2025-06-30.basil; managed_payments_preview=v1",
    })
  : null;

function requireStripeConfig() {
  if (!stripe || !serverConfig.stripe.priceId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Stripe is not configured. Please contact your administrator.",
    });
  }
  return {
    stripe,
    priceId: serverConfig.stripe.priceId,
    yearlyPriceId: serverConfig.stripe.yearlyPriceId,
  };
}

// Taken from https://github.com/t3dotgg/stripe-recommendations

const allowedEvents: Stripe.Event.Type[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.upcoming",
  "invoice.marked_uncollectible",
  "invoice.payment_succeeded",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
];

type SubscriptionTransition =
  | "upgrade"
  | "downgrade"
  | "renewed"
  | "scheduled_cancellation"
  | "resubscribe"
  | "no_change";

function computeSubscriptionTransition(
  prev: { tier?: string; status?: string | null; cancelAtPeriodEnd?: boolean },
  next: { tier: string; status: string; cancelAtPeriodEnd: boolean },
): SubscriptionTransition {
  const wasPaid = prev.tier === "paid";
  const isPaid = next.tier === "paid";
  if (!wasPaid && isPaid) {
    return prev.status === "past_due" ? "renewed" : "upgrade";
  }
  if (wasPaid && !isPaid) {
    return "downgrade";
  }
  if (!prev.cancelAtPeriodEnd && next.cancelAtPeriodEnd) {
    return "scheduled_cancellation";
  }
  if (prev.cancelAtPeriodEnd && !next.cancelAtPeriodEnd) {
    return "resubscribe";
  }
  if (prev.status !== next.status) {
    return "renewed";
  }
  return "no_change";
}

export async function syncStripeDataToDatabase(
  customerId: string,
  db: Context["db"],
) {
  return withEventLog("subscription.synced", async () => {
    addLogFields<"subscription.synced">({
      "stripe.customer_id": customerId,
    });

    if (!stripe) {
      throw new Error("Stripe is not configured");
    }

    const existingSubscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeCustomerId, customerId),
    });
    const prevTier = existingSubscription?.tier;
    const prevStatus = existingSubscription?.status;
    const prevCancelAtPeriodEnd =
      existingSubscription?.cancelAtPeriodEnd ?? false;

    if (!existingSubscription) {
      console.warn(
        `Ignoring Stripe webhook for unknown customer ID ${customerId}`,
      );
      addLogFields<"subscription.synced">({
        "subscription.sync_skipped_reason": "unknown_customer",
      });
      return;
    }

    addLogFields<"subscription.synced">({
      "user.id": existingSubscription.userId,
      "subscription.prev_tier": prevTier,
      "subscription.prev_status": prevStatus ?? undefined,
    });

    const user = await db.query.users.findFirst({
      where: eq(users.id, existingSubscription.userId),
      columns: {
        manualTierName: true,
      },
    });
    const manualTierName = user?.manualTierName ?? null;

    try {
      const subscriptionsList = await stripe.subscriptions.list({
        customer: customerId,
        limit: 100,
        status: "all",
      });

      if (subscriptionsList.data.length === 0) {
        if (manualTierName) {
          // The user's entitlements were granted manually (e.g. through a
          // collaboration); don't downgrade them to the free tier.
          addLogFields<"subscription.synced">({
            "subscription.sync_skipped_reason": "manual_tier",
          });
          return;
        }
        await db.transaction(async (trx) => {
          await trx
            .update(subscriptions)
            .set({
              status: "canceled",
              tier: "free",
              stripeSubscriptionId: null,
              priceId: null,
              cancelAtPeriodEnd: false,
              startDate: null,
              endDate: null,
            })
            .where(eq(subscriptions.stripeCustomerId, customerId));

          // Update user quotas to free tier limits and disable browser crawling
          await trx
            .update(users)
            .set({
              bookmarkQuota: serverConfig.quotas.free.bookmarkLimit,
              storageQuota: serverConfig.quotas.free.assetSizeBytes,
              browserCrawlingEnabled:
                serverConfig.quotas.free.browserCrawlingEnabled,
            })
            .where(eq(users.id, existingSubscription.userId));
        });
        addLogFields<"subscription.synced">({
          "subscription.tier": "free",
          "subscription.status": "canceled",
          "subscription.cancel_at_period_end": false,
          "subscription.transition": computeSubscriptionTransition(
            {
              tier: prevTier,
              status: prevStatus,
              cancelAtPeriodEnd: prevCancelAtPeriodEnd,
            },
            { tier: "free", status: "canceled", cancelAtPeriodEnd: false },
          ),
        });
        return;
      }

      // A customer can have more than one subscription. For example, while
      // upgrading from a monthly to a yearly plan the old monthly subscription
      // lingers until its period ends. The subscription that reflects the
      // user's entitlement is the active/trialing one whose period extends
      // furthest into the future: when the old monthly plan is finally
      // canceled it fires `customer.subscription.deleted`, and a naive
      // `data[0]` (or `limit: 1`) can pick up that canceled subscription and
      // wrongly downgrade a user who still has an active yearly plan. Prefer
      // the active/trialing subscription with the latest end date, and only
      // fall back to the newest one when none are active.
      const periodEnd = (sub: Stripe.Subscription) =>
        sub.items.data[0]?.current_period_end ?? 0;
      const activeSubscriptions = subscriptionsList.data.filter(
        (sub) => sub.status === "active" || sub.status === "trialing",
      );
      const subscription =
        activeSubscriptions.length > 0
          ? activeSubscriptions.reduce((latest, sub) =>
              periodEnd(sub) > periodEnd(latest) ? sub : latest,
            )
          : subscriptionsList.data[0];
      const subscriptionItem = subscription.items.data[0];

      const subData = {
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
        tier:
          subscription.status === "active" || subscription.status === "trialing"
            ? ("paid" as const)
            : ("free" as const),
        priceId: subscription.items.data[0]?.price.id || null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        startDate: subscriptionItem.current_period_start
          ? new Date(subscriptionItem.current_period_start * 1000)
          : null,
        endDate: subscriptionItem.current_period_end
          ? new Date(subscriptionItem.current_period_end * 1000)
          : null,
      };

      if (subData.tier === "free" && manualTierName) {
        // The user's entitlements were granted manually (e.g. through a
        // collaboration); don't downgrade them to the free tier.
        addLogFields<"subscription.synced">({
          "subscription.sync_skipped_reason": "manual_tier",
        });
        return;
      }

      await db.transaction(async (trx) => {
        await trx
          .update(subscriptions)
          .set(subData)
          .where(eq(subscriptions.stripeCustomerId, customerId));

        if (subData.status === "active" || subData.status === "trialing") {
          // Enable paid tier quotas and browser crawling. A real subscription
          // supersedes a manually granted tier, so clear it.
          await trx
            .update(users)
            .set({
              bookmarkQuota: serverConfig.quotas.paid.bookmarkLimit,
              storageQuota: serverConfig.quotas.paid.assetSizeBytes,
              browserCrawlingEnabled:
                serverConfig.quotas.paid.browserCrawlingEnabled,
              manualTierName: null,
            })
            .where(eq(users.id, existingSubscription.userId));
        } else {
          // Set free tier quotas and disable browser crawling
          await trx
            .update(users)
            .set({
              bookmarkQuota: serverConfig.quotas.free.bookmarkLimit,
              storageQuota: serverConfig.quotas.free.assetSizeBytes,
              browserCrawlingEnabled:
                serverConfig.quotas.free.browserCrawlingEnabled,
            })
            .where(eq(users.id, existingSubscription.userId));
        }
      });

      addLogFields<"subscription.synced">({
        "subscription.tier": subData.tier,
        "subscription.status": subData.status,
        "subscription.cancel_at_period_end": subData.cancelAtPeriodEnd,
        "subscription.transition": computeSubscriptionTransition(
          {
            tier: prevTier,
            status: prevStatus,
            cancelAtPeriodEnd: prevCancelAtPeriodEnd,
          },
          {
            tier: subData.tier,
            status: subData.status,
            cancelAtPeriodEnd: subData.cancelAtPeriodEnd,
          },
        ),
      });

      return subData;
    } catch (error) {
      console.error("Error syncing Stripe data:", error);
      throw error;
    }
  });
}

async function processEvent(event: Stripe.Event, db: Context["db"]) {
  if (!allowedEvents.includes(event.type)) {
    return;
  }

  const { customer: customerId } = event.data.object as {
    customer: string;
  };

  if (typeof customerId !== "string") {
    throw new Error(
      `[STRIPE HOOK] Customer ID isn't string. Event type: ${event.type}`,
    );
  }

  addLogFields<"subscription.webhook_received">({
    "stripe.customer_id": customerId,
  });

  return await syncStripeDataToDatabase(customerId, db);
}

const subscriptionsProcedure = createScopedAuthedProcedure("subscriptions");
const adminSubscriptionsProcedure = createAdminScopedProcedure("subscriptions");

export const subscriptionsRouter = router({
  getSubscriptionStatus: subscriptionsProcedure.query(async ({ ctx }) => {
    const [user, subscription] = await Promise.all([
      ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.user.id),
        columns: {
          manualTierName: true,
        },
      }),
      ctx.db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, ctx.user.id),
      }),
    ]);
    const manualTierName = user?.manualTierName ?? null;

    if (!subscription) {
      return {
        tier: manualTierName ? ("custom" as const) : ("free" as const),
        manualTierName,
        status: null,
        startDate: null,
        endDate: null,
        hasActiveSubscription: false,
        cancelAtPeriodEnd: false,
      };
    }

    return {
      tier: manualTierName ? ("custom" as const) : subscription.tier,
      manualTierName,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      hasActiveSubscription:
        subscription.status === "active" || subscription.status === "trialing",
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
    };
  }),

  getSubscriptionPrice: subscriptionsProcedure.query(async () => {
    if (!stripe) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Stripe is not configured. Please contact your administrator.",
      });
    }

    const { priceId, yearlyPriceId } = requireStripeConfig();

    const monthlyPrice = await stripe.prices.retrieve(priceId);

    const result: {
      monthly: { priceId: string; currency: string; amount: number | null };
      yearly: {
        priceId: string;
        currency: string;
        amount: number | null;
      } | null;
    } = {
      monthly: {
        priceId: monthlyPrice.id,
        currency: monthlyPrice.currency,
        amount: monthlyPrice.unit_amount,
      },
      yearly: null,
    };

    if (yearlyPriceId) {
      const yearlyPrice = await stripe.prices.retrieve(yearlyPriceId);
      result.yearly = {
        priceId: yearlyPrice.id,
        currency: yearlyPrice.currency,
        amount: yearlyPrice.unit_amount,
      };
    }

    return result;
  }),

  createCheckoutSession: subscriptionsProcedure
    .use(createEventLogMiddleware("subscription.checkout_started"))
    .input(
      z
        .object({
          billingPeriod: z.enum(["monthly", "yearly"]).default("monthly"),
        })
        .prefault({}),
    )
    .mutation(async ({ ctx, input }) => {
      addLogFields<"subscription.checkout_started">({
        "subscription.billing_period": input.billingPeriod,
      });
      const { stripe, priceId, yearlyPriceId } = requireStripeConfig();

      const selectedPriceId =
        input.billingPeriod === "yearly" && yearlyPriceId
          ? yearlyPriceId
          : priceId;

      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.user.id),
        columns: {
          email: true,
        },
        with: {
          subscription: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const existingSubscription = user.subscription;

      if (existingSubscription?.status === "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User already has an active subscription",
        });
      }

      let customerId = existingSubscription?.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            userId: ctx.user.id,
          },
        });
        customerId = customer.id;

        if (!existingSubscription) {
          await ctx.db.insert(subscriptions).values({
            userId: ctx.user.id,
            stripeCustomerId: customerId,
            status: "unpaid",
          });
        } else {
          await ctx.db
            .update(subscriptions)
            .set({ stripeCustomerId: customerId })
            .where(eq(subscriptions.userId, ctx.user.id));
        }
      }

      // @ts-expect-error managed_payments is a Stripe preview feature not yet in the SDK types
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [
          {
            price: selectedPriceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${serverConfig.publicUrl}/settings/subscription?success=true`,
        cancel_url: `${serverConfig.publicUrl}/settings/subscription?canceled=true`,
        metadata: {
          userId: ctx.user.id,
        },
        customer_update: {
          address: "auto",
        },
        allow_promotion_codes: true,
        managed_payments: {
          enabled: true,
        },
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    }),

  syncWithStripe: subscriptionsProcedure.mutation(async ({ ctx }) => {
    const subscription = await ctx.db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, ctx.user.id),
    });

    if (!subscription?.stripeCustomerId) {
      // No Stripe customer found for user
      return { success: true };
    }

    await syncStripeDataToDatabase(subscription.stripeCustomerId, ctx.db);
    return { success: true };
  }),

  createPortalSession: subscriptionsProcedure
    .use(createEventLogMiddleware("subscription.portal_opened"))
    .mutation(async ({ ctx }) => {
      const { stripe } = requireStripeConfig();

      const subscription = await ctx.db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, ctx.user.id),
      });

      if (!subscription?.stripeCustomerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No Stripe customer found",
        });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: `${serverConfig.publicUrl}/settings/subscription`,
      });

      return {
        url: session.url,
      };
    }),

  getQuotaUsage: subscriptionsProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
      columns: {
        bookmarkQuota: true,
        storageQuota: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // Get current bookmark count
    const [{ bookmarkCount }] = await ctx.db
      .select({ bookmarkCount: count() })
      .from(bookmarks)
      .where(eq(bookmarks.userId, ctx.user.id));

    // Get current storage usage
    const [{ storageUsed }] = await ctx.db
      .select({ storageUsed: sum(assets.size) })
      .from(assets)
      .where(eq(assets.userId, ctx.user.id));

    return {
      bookmarks: {
        used: bookmarkCount,
        quota: user.bookmarkQuota,
        unlimited: user.bookmarkQuota === null,
      },
      storage: {
        used: Number(storageUsed) || 0,
        quota: user.storageQuota,
        unlimited: user.storageQuota === null,
      },
    };
  }),

  // Grants a manually-managed tier (e.g. a collaboration with another
  // company). While set, Stripe sync won't downgrade the user's entitlements;
  // it's cleared automatically when the user gets an active Stripe
  // subscription. Pass manualTierName: null to revoke the grant and restore
  // the configured free-tier entitlements.
  updateSubscriptionTier: adminSubscriptionsProcedure
    .input(
      z.object({
        email: z.string().email(),
        manualTierName: z.string().trim().min(1).max(100).nullable(),
        bookmarkQuota: z.number().int().min(0).nullable().optional(),
        storageQuota: z.number().int().min(0).nullable().optional(),
        browserCrawlingEnabled: z.boolean().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
        columns: {
          id: true,
          emailVerified: true,
        },
        with: {
          subscription: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (
        input.manualTierName &&
        serverConfig.auth.emailVerificationRequired &&
        !user.emailVerified
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "User email is not verified",
        });
      }

      if (
        input.manualTierName &&
        (user.subscription?.status === "active" ||
          user.subscription?.status === "trialing")
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User already has an active Stripe subscription",
        });
      }

      const updateData: Partial<typeof users.$inferInsert> =
        input.manualTierName === null
          ? {
              manualTierName: null,
              bookmarkQuota: serverConfig.quotas.free.bookmarkLimit,
              storageQuota: serverConfig.quotas.free.assetSizeBytes,
              browserCrawlingEnabled:
                serverConfig.quotas.free.browserCrawlingEnabled,
            }
          : { manualTierName: input.manualTierName };

      if (input.manualTierName !== null) {
        if (input.bookmarkQuota !== undefined) {
          updateData.bookmarkQuota = input.bookmarkQuota;
        }

        if (input.storageQuota !== undefined) {
          updateData.storageQuota = input.storageQuota;
        }

        if (input.browserCrawlingEnabled !== undefined) {
          updateData.browserCrawlingEnabled = input.browserCrawlingEnabled;
        }
      }

      await ctx.db.update(users).set(updateData).where(eq(users.id, user.id));
    }),

  handleWebhook: publicProcedure
    .use(createEventLogMiddleware("subscription.webhook_received"))
    .input(
      z.object({
        body: z.string(),
        signature: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!stripe || !serverConfig.stripe.webhookSecret) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Stripe is not configured",
        });
      }

      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(
          input.body,
          input.signature,
          serverConfig.stripe.webhookSecret,
        );
      } catch (err) {
        console.error("Webhook signature verification failed:", err);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid signature",
        });
      }

      addLogFields<"subscription.webhook_received">({
        "stripe.event_type": event.type,
      });

      try {
        await processEvent(event, ctx.db);
        return { received: true };
      } catch (error) {
        console.error("Error processing webhook:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        });
      }
    }),
});
