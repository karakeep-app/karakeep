import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  zNewFeedSchema,
  zUpdateFeedSchema,
} from "@karakeep/shared/types/feeds";

import { authMiddleware } from "../middlewares/auth";

const app = new Hono()
  .use(authMiddleware)

  // GET /feeds
  .get("/", async (c) => {
    const feeds = await c.var.api.feeds.list();
    return c.json(feeds, 200);
  })

  // POST /feeds
  .post("/", zValidator("json", zNewFeedSchema), async (c) => {
    const body = c.req.valid("json");
    const feed = await c.var.api.feeds.create(body);
    return c.json(feed, 201);
  })

  // GET /feeds/:feedId
  .get("/:feedId", async (c) => {
    const feedId = c.req.param("feedId");
    const feed = await c.var.api.feeds.get({ feedId });
    return c.json(feed, 200);
  })

  // PATCH /feeds/:feedId
  .patch(
    "/:feedId",
    zValidator("json", zUpdateFeedSchema.omit({ feedId: true })),
    async (c) => {
      const feedId = c.req.param("feedId");
      const body = c.req.valid("json");
      const feed = await c.var.api.feeds.update({ feedId, ...body });
      return c.json(feed, 200);
    },
  )

  // DELETE /feeds/:feedId
  .delete("/:feedId", async (c) => {
    const feedId = c.req.param("feedId");
    await c.var.api.feeds.delete({ feedId });
    return c.body(null, 204);
  })

  // PUT /feeds/:feedId/fetch
  .put("/:feedId/fetch", async (c) => {
    const feedId = c.req.param("feedId");
    await c.var.api.feeds.fetchNow({ feedId });
    return c.body(null, 204);
  });

export default app;
