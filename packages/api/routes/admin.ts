import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { updateUserSchema } from "@karakeep/shared/types/admin";

import { adminAuthMiddleware } from "../middlewares/auth";

const app = new Hono()
  .use(adminAuthMiddleware)

  // PUT /admin/users/:userId
  .put("/users/:userId", zValidator("json", updateUserSchema), async (c) => {
    const userId = c.req.param("userId");
    const body = c.req.valid("json");

    // Ensure the userId from the URL matches the one in the body
    const input = { ...body, userId };

    await c.var.api.admin.updateUser(input);

    return c.json({ success: true }, 200);
  })

  // POST /admin/jobs/trigger/recrawl
  .post(
    "/jobs/trigger/recrawl",
    zValidator(
      "json",
      z.object({
        crawlStatus: z
          .enum(["success", "failure", "pending", "all"])
          .default("all"),
        runInference: z.boolean().default(false),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      await c.var.api.admin.recrawlLinks(body);
      return c.json({ success: true }, 200);
    },
  )

  // POST /admin/jobs/trigger/reindex
  .post("/jobs/trigger/reindex", async (c) => {
    await c.var.api.admin.reindexAllBookmarks();
    return c.json({ success: true }, 200);
  })

  // POST /admin/jobs/trigger/inference
  .post(
    "/jobs/trigger/inference",
    zValidator(
      "json",
      z.object({
        type: z.enum(["tag", "summarize"]),
        status: z.enum(["success", "failure", "pending", "all"]).default("all"),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      await c.var.api.admin.reRunInferenceOnAllBookmarks(body);
      return c.json({ success: true }, 200);
    },
  );

export default app;
