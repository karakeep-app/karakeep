import { describe, expect, test } from "vitest";

import type { ZWebhookRequest } from "@karakeep/shared-server";

import { shouldDeliverToWebhook } from "./webhookDelivery";

const webhook = {
  id: "webhook1",
  events: ["created" as const, "crawled" as const],
};

function job(overrides: Partial<ZWebhookRequest> = {}): ZWebhookRequest {
  return {
    bookmarkId: "bookmark1",
    operation: "created",
    ...overrides,
  };
}

describe("shouldDeliverToWebhook", () => {
  test("delivers an event the webhook is subscribed to", () => {
    expect(shouldDeliverToWebhook(webhook, job({ operation: "crawled" }))).toBe(
      true,
    );
  });

  test("skips an event the webhook is not subscribed to", () => {
    expect(shouldDeliverToWebhook(webhook, job({ operation: "edited" }))).toBe(
      false,
    );
  });

  test("delivers a rule triggered job to the webhook it targets, whatever its events", () => {
    expect(
      shouldDeliverToWebhook(
        { id: "webhook1", events: [] },
        job({ operation: "rule triggered", webhookId: "webhook1" }),
      ),
    ).toBe(true);
  });

  test("skips a rule triggered job aimed at another webhook", () => {
    expect(
      shouldDeliverToWebhook(
        webhook,
        job({ operation: "rule triggered", webhookId: "webhook2" }),
      ),
    ).toBe(false);
  });

  test("never delivers a rule triggered job that targets no webhook", () => {
    expect(
      shouldDeliverToWebhook(webhook, job({ operation: "rule triggered" })),
    ).toBe(false);
  });

  test("targeting a webhook narrows delivery to it even for a regular event", () => {
    expect(
      shouldDeliverToWebhook(
        webhook,
        job({ operation: "created", webhookId: "webhook2" }),
      ),
    ).toBe(false);
  });
});
