import { prometheus } from "@hono/prometheus";
import { Counter, Registry } from "prom-client";

const registry = new Registry();

export const { printMetrics } = prometheus({
  registry: registry,
  prefix: "karakeep_",
});

export const workerStatsCounter = new Counter({
  name: "karakeep_worker_stats",
  help: "Stats for each worker",
  labelNames: ["worker_name", "status"],
});

registry.registerMetric(workerStatsCounter);
