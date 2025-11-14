import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { zAdminMaintenanceTaskSchema } from "@karakeep/shared-server";
import {
  resetPasswordSchema,
  updateUserSchema,
  zAdminCreateUserSchema,
} from "@karakeep/shared/types/admin";

import { adminAuthMiddleware } from "../middlewares/auth";

const app = new Hono()
  .use(adminAuthMiddleware)

  // GET /admin/stats
  .get("/stats", async (c) => {
    const result = await c.var.api.admin.stats();
    return c.json(result, 200);
  })

  // GET /admin/background-jobs/stats
  .get("/background-jobs/stats", async (c) => {
    const result = await c.var.api.admin.backgroundJobsStats();
    return c.json(result, 200);
  })

  // GET /admin/users/stats
  .get("/users/stats", async (c) => {
    const result = await c.var.api.admin.userStats();
    return c.json(result, 200);
  })

  // GET /admin/notices
  .get("/notices", async (c) => {
    const result = await c.var.api.admin.getAdminNoticies();
    return c.json(result, 200);
  })

  // GET /admin/connections/check
  .get("/connections/check", async (c) => {
    const result = await c.var.api.admin.checkConnections();
    return c.json(result, 200);
  })

  // POST /admin/links/recrawl
  .post(
    "/links/recrawl",
    zValidator(
      "json",
      z.object({
        crawlStatus: z.enum(["success", "failure", "all"]),
        runInference: z.boolean(),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      await c.var.api.admin.recrawlLinks(body);
      return c.json({ success: true }, 200);
    },
  )

  // POST /admin/bookmarks/reindex
  .post("/bookmarks/reindex", async (c) => {
    await c.var.api.admin.reindexAllBookmarks();
    return c.json({ success: true }, 200);
  })

  // POST /admin/assets/reprocess
  .post("/assets/reprocess", async (c) => {
    await c.var.api.admin.reprocessAssetsFixMode();
    return c.json({ success: true }, 200);
  })

  // POST /admin/bookmarks/inference
  .post(
    "/bookmarks/inference",
    zValidator(
      "json",
      z.object({
        type: z.enum(["tag", "summarize"]),
        status: z.enum(["success", "failure", "all"]),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      await c.var.api.admin.reRunInferenceOnAllBookmarks(body);
      return c.json({ success: true }, 200);
    },
  )

  // POST /admin/maintenance/tasks
  .post(
    "/maintenance/tasks",
    zValidator("json", zAdminMaintenanceTaskSchema),
    async (c) => {
      const body = c.req.valid("json");
      await c.var.api.admin.runAdminMaintenanceTask(body);
      return c.json({ success: true }, 200);
    },
  )

  // POST /admin/users
  .post("/users", zValidator("json", zAdminCreateUserSchema), async (c) => {
    const body = c.req.valid("json");
    const result = await c.var.api.admin.createUser(body);
    return c.json(result, 201);
  })

  // PUT /admin/users/:userId
  .put(
    "/users/:userId",
    zValidator("json", updateUserSchema.omit({ userId: true })),
    async (c) => {
      const userId = c.req.param("userId");
      const body = c.req.valid("json");

      // Ensure the userId from the URL matches the one in the body
      const input = { ...body, userId };

      await c.var.api.admin.updateUser(input);

      return c.json({ success: true }, 200);
    },
  )

  // PUT /admin/users/:userId/password
  .put(
    "/users/:userId/password",
    zValidator("json", resetPasswordSchema.omit({ userId: true })),
    async (c) => {
      const userId = c.req.param("userId");
      const body = c.req.valid("json");

      const input = { ...body, userId };

      await c.var.api.admin.resetPassword(input);

      return c.json({ success: true }, 200);
    },
  );

export default app;
