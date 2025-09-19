import { Hono } from "hono";

import { Context, createCallerFactory } from "@karakeep/trpc";
import { appRouter } from "@karakeep/trpc/routers/_app";

const createCaller = createCallerFactory(appRouter);

const app = new Hono<{
  Variables: {
    ctx: Context;
  };
}>().post("/stripe", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  try {
    const api = createCaller(c.get("ctx"));
    const result = await api.subscriptions.handleWebhook({
      body,
      signature,
    });

    return c.json(result);
  } catch (error) {
    console.error("Webhook processing failed:", error);

    if (error instanceof Error) {
      if (error.message.includes("Invalid signature")) {
        return c.json({ error: "Invalid signature" }, 400);
      }
      if (error.message.includes("not configured")) {
        return c.json({ error: "Stripe is not configured" }, 400);
      }
    }

    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
