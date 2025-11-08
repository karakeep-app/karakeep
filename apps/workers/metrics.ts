import { prometheus } from "@hono/prometheus";
import { Counter, Gauge, Registry } from "prom-client";

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

export const workerLastFailureGauge = new Gauge({
  name: "karakeep_worker_last_failure_timestamp",
  help: "Timestamp of the last failure for each worker",
  labelNames: ["worker_name"],
});

registry.registerMetric(workerStatsCounter);
registry.registerMetric(workerLastFailureGauge);
