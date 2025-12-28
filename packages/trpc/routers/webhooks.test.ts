import { beforeEach, describe, expect, test } from "vitest";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Webhook Routes", () => {
  test<CustomTestContext>("create webhook", async ({ apiCallers }) => {
    const api = apiCallers[0].webhooks;
    const newWebhook = await api.create({
      url: "https://example.com/webhook",
      events: ["created", "edited"],
    });

    expect(newWebhook).toBeDefined();
    expect(newWebhook.url).toEqual("https://example.com/webhook");
    expect(newWebhook.events).toEqual(["created", "edited"]);
    expect(newWebhook.hasToken).toBe(false); // Assuming token is not set by default
  });

  test<CustomTestContext>("update webhook", async ({ apiCallers }) => {
    const api = apiCallers[0].webhooks;

    // First, create a webhook to update
    const createdWebhook = await api.create({
      url: "https://example.com/webhook",
      events: ["created"],
    });

    // Update it
    const updatedWebhook = await api.update({
      webhookId: createdWebhook.id,
      url: "https://updated-example.com/webhook",
      events: ["created", "edited"],
      token: "test-token",
    });

    expect(updatedWebhook.url).toEqual("https://updated-example.com/webhook");
    expect(updatedWebhook.events).toEqual(["created", "edited"]);
    expect(updatedWebhook.hasToken).toBe(true);

    // Test updating a non-existent webhook
    await expect(() =>
      api.update({
        webhookId: "non-existent-id",
        url: "https://fail.com",
        events: ["created"],
      }),
    ).rejects.toThrow(/Webhook not found/);
  });

  test<CustomTestContext>("list webhooks", async ({ apiCallers }) => {
    const api = apiCallers[0].webhooks;

    // Create a couple of webhooks
    await api.create({
      url: "https://example1.com/webhook",
      events: ["created"],
    });
    await api.create({
      url: "https://example2.com/webhook",
      events: ["edited"],
    });

    const result = await api.list();
    expect(result.webhooks).toBeDefined();
    expect(result.webhooks.length).toBeGreaterThanOrEqual(2);
    expect(
      result.webhooks.some((w) => w.url === "https://example1.com/webhook"),
    ).toBe(true);
    expect(
      result.webhooks.some((w) => w.url === "https://example2.com/webhook"),
    ).toBe(true);
  });

  test<CustomTestContext>("delete webhook", async ({ apiCallers }) => {
    const api = apiCallers[0].webhooks;

    // Create a webhook to delete
    const createdWebhook = await api.create({
      url: "https://example.com/webhook",
      events: ["created"],
    });

    // Delete it
    await api.delete({ webhookId: createdWebhook.id });

    // Verify it's deleted
    await expect(() =>
      api.update({
        webhookId: createdWebhook.id,
        url: "https://updated.com",
        events: ["created"],
      }),
    ).rejects.toThrow(/Webhook not found/);
  });

  test<CustomTestContext>("privacy for webhooks", async ({ apiCallers }) => {
    const user1Webhook = await apiCallers[0].webhooks.create({
      url: "https://user1-webhook.com",
      events: ["created"],
    });
    const user2Webhook = await apiCallers[1].webhooks.create({
      url: "https://user2-webhook.com",
      events: ["created"],
    });

    // User 1 should not access User 2's webhook
    await expect(() =>
      apiCallers[0].webhooks.delete({ webhookId: user2Webhook.id }),
    ).rejects.toThrow(/User is not allowed to access resource/);
    await expect(() =>
      apiCallers[0].webhooks.update({
        webhookId: user2Webhook.id,
        url: "https://fail.com",
        events: ["created"],
      }),
    ).rejects.toThrow(/User is not allowed to access resource/);

    // List should only show the correct user's webhooks
    const user1List = await apiCallers[0].webhooks.list();
    expect(user1List.webhooks.some((w) => w.id === user1Webhook.id)).toBe(true);
    expect(user1List.webhooks.some((w) => w.id === user2Webhook.id)).toBe(
      false,
    );
  });

  test<CustomTestContext>("webhook limit enforcement", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].webhooks;

    // Create 100 webhooks (the maximum)
    for (let i = 0; i < 100; i++) {
      await api.create({
        url: `https://example${i}.com/webhook`,
        events: ["created"],
      });
    }

    // The 101st webhook should fail
    await expect(() =>
      api.create({
        url: "https://example101.com/webhook",
        events: ["created"],
      }),
    ).rejects.toThrow(/Maximum number of webhooks \(100\) reached/);
  });
});
