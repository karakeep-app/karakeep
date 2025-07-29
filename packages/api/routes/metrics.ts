// Import stats to register Prometheus metrics
import "@karakeep/trpc/stats";

import { prometheus } from "@hono/prometheus";
import { Hono } from "hono";
import { register } from "prom-client";

import { prometheusAuthMiddleware } from "../middlewares/prometheusAuth";

export const { printMetrics, registerMetrics } = prometheus({
  registry: register,
  prefix: "karakeep_",
});

const app = new Hono().get("/", prometheusAuthMiddleware, printMetrics);

export default app;
