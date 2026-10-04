// Must load before @karakeep/shared/config, which parses process.env at import time.
import "dotenv/config";

import { loadAllPlugins, prepareQueue } from "@karakeep/shared-server";

/**
 * Runs the queue provider's migrations (e.g. liteque's queue.db) without
 * starting the workers. The workers also do this on startup.
 */
async function main() {
  await loadAllPlugins();
  await prepareQueue();
  // Plugins may leave connections open; exit explicitly.
  process.exit(0);
}

void main();
