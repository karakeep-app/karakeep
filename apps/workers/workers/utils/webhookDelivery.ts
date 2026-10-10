import type { ZWebhookRequest } from "@karakeep/shared-server";
import type { ZWebhookEvent } from "@karakeep/shared/types/webhooks";

export function shouldDeliverToWebhook(
  webhook: { id: string; events: ZWebhookEvent[] },
  job: ZWebhookRequest,
) {
  // Rule engine jobs target a specific webhook, so they bypass the event filter.
  if (job.webhookId) {
    return webhook.id === job.webhookId;
  }
  return (
    job.operation !== "rule triggered" && webhook.events.includes(job.operation)
  );
}
