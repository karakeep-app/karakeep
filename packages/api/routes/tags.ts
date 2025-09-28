import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import {
  zCreateTagRequestSchema,
  zTagListApiResultSchema,
  zTagListQueryParamsSchema,
  zUpdateTagRequestSchema,
} from "@karakeep/shared/types/tags";

import { authMiddleware } from "../middlewares/auth";
import { adaptPagination, zPagination } from "../utils/pagination";
import { zGetBookmarkQueryParamsSchema } from "../utils/types";

const app = new Hono()
  .use(authMiddleware)

  // GET /tags
  .get("/", zValidator("query", zTagListQueryParamsSchema), async (c) => {
    const searchParams = c.req.valid("query");
    const tags = await c.var.api.tags.list({
      nameContains: searchParams.nameContains,
      attachedBy: searchParams.attachedBy,
      sortBy: searchParams.sort,
      cursor: searchParams.cursor,
      limit: searchParams.limit,
    });

    const resp: z.infer<typeof zTagListApiResultSchema> = {
      tags: tags.tags,
      nextCursor: tags.nextCursor
        ? Buffer.from(JSON.stringify(tags.nextCursor)).toString("base64url")
        : null,
    };
    return c.json(resp, 200);
  })

  // POST /tags
  .post("/", zValidator("json", zCreateTagRequestSchema), async (c) => {
    const body = c.req.valid("json");
    const tags = await c.var.api.tags.create(body);
    return c.json(tags, 201);
  })

  // GET /tags/[tagId]
  .get("/:tagId", async (c) => {
    const tagId = c.req.param("tagId");
    const tag = await c.var.api.tags.get({ tagId });
    return c.json(tag, 200);
  })

  // PATCH /tags/[tagId]
  .patch(
    "/:tagId",
    zValidator("json", zUpdateTagRequestSchema.omit({ tagId: true })),
    async (c) => {
      const tagId = c.req.param("tagId");
      const body = c.req.valid("json");
      const tag = await c.var.api.tags.update({ tagId, ...body });
      return c.json(tag, 200);
    },
  )

  // DELETE /tags/[tagId]
  .delete("/:tagId", async (c) => {
    const tagId = c.req.param("tagId");
    await c.var.api.tags.delete({ tagId });
    return c.body(null, 204);
  })

  // GET /tags/[tagId]/bookmarks
  .get(
    "/:tagId/bookmarks",
    zValidator("query", zPagination.and(zGetBookmarkQueryParamsSchema)),
    async (c) => {
      const tagId = c.req.param("tagId");
      const searchParams = c.req.valid("query");
      const bookmarks = await c.var.api.bookmarks.getBookmarks({
        tagId,
        ...searchParams,
      });
      return c.json(adaptPagination(bookmarks), 200);
    },
  );

export default app;
