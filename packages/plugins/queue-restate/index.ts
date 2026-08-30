// Auto-register the Restate queue provider when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";
import type { PluginProvider } from "@karakeep/shared/plugins";
import type { QueueClient } from "@karakeep/shared/queueing";

import { envConfig } from "./src/env";

export class RestateQueueProvider implements PluginProvider<QueueClient> {
  private client: QueueClient | null = null;

  static isConfigured(): boolean {
    return envConfig.RESTATE_LISTEN_PORT !== undefined;
  }

  async getClient(): Promise<QueueClient | null> {
    const { RestateQueueClient } = await import("./src");
    if (!this.client) {
      const client = new RestateQueueClient();
      this.client = client;
    }
    return this.client;
  }
}

if (RestateQueueProvider.isConfigured()) {
  PluginManager.register({
    type: PluginType.Queue,
    name: "Restate",
    provider: new RestateQueueProvider(),
  });
}
