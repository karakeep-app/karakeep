// Import stats to register Prometheus metrics
import "@karakeep/trpc/stats";

import { prometheus } from "@hono/prometheus";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { register } from "prom-client";

import serverConfig from "@karakeep/shared/config";

type PrometheusHandlers = ReturnType<typeof prometheus>;

const globalForPrometheus = globalThis as typeof globalThis & {
  __karakeepApiPrometheus?: PrometheusHandlers;
};

const prometheusHandlers = (globalForPrometheus.__karakeepApiPrometheus ??=
  prometheus({
    registry: register,
    prefix: "karakeep_",
    collectDefaultMetrics: true,
  }));

export const { printMetrics, registerMetrics } = prometheusHandlers;

const app = new Hono().get(
  "/",
  bearerAuth({ token: serverConfig.prometheus.metricsToken }),
  printMetrics,
);

export default app;
