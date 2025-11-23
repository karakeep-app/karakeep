import { prometheus } from "@hono/prometheus";
import { Counter, Registry } from "prom-client";

const registry = new Registry();

export const { printMetrics } = prometheus({
  registry: registry,
  prefix: "karakeep_",
  collectDefaultMetrics: true,
});

export const workerStatsCounter = new Counter({
  name: "karakeep_worker_stats",
  help: "Stats for each worker",
  labelNames: ["worker_name", "status"],
});

export const crawlerStatusCodeCounter = new Counter({
  name: "karakeep_crawler_status_codes_total",
  help: "HTTP status codes encountered during crawling",
  labelNames: ["status_code"],
});

registry.registerMetric(workerStatsCounter);
registry.registerMetric(crawlerStatusCodeCounter);
