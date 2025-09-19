import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  zEditBookmarkListSchema,
  zNewBookmarkListSchema,
} from "@karakeep/shared/types/lists";

import { authMiddleware } from "../middlewares/auth";
import { adaptPagination, zPagination } from "../utils/pagination";
import { zGetBookmarkQueryParamsSchema } from "../utils/types";

const app = new Hono()
  .use(authMiddleware)
  .get("/", async (c) => {
    const lists = await c.var.api.lists.list();
    return c.json(lists, 200);
  })
  .post("/", zValidator("json", zNewBookmarkListSchema), async (c) => {
    const body = c.req.valid("json");
    const list = await c.var.api.lists.create(body);
    return c.json(list, 201);
  })
  .get("/:listId", async (c) => {
    const listId = c.req.param("listId");
    const list = await c.var.api.lists.get({ listId });
    return c.json(list, 200);
  })
  .patch(
    "/:listId",
    zValidator("json", zEditBookmarkListSchema.omit({ listId: true })),
    async (c) => {
      const listId = c.req.param("listId");
      const body = c.req.valid("json");
      const list = await c.var.api.lists.edit({ ...body, listId });
      return c.json(list, 200);
    },
  )
  .delete("/:listId", async (c) => {
    const listId = c.req.param("listId");
    await c.var.api.lists.delete({ listId });
    return c.body(null, 204);
  })
  .get(
    "/:listId/bookmarks",
    zValidator("query", zPagination.and(zGetBookmarkQueryParamsSchema)),
    async (c) => {
      const listId = c.req.param("listId");
      const searchParams = c.req.valid("query");
      const bookmarks = await c.var.api.bookmarks.getBookmarks({
        listId,
        ...searchParams,
      });
      return c.json(adaptPagination(bookmarks), 200);
    },
  )
  .put("/:listId/bookmarks/:bookmarkId", async (c) => {
    const listId = c.req.param("listId");
    const bookmarkId = c.req.param("bookmarkId");
    await c.var.api.lists.addToList({ listId, bookmarkId });
    return c.body(null, 204);
  })
  .delete("/:listId/bookmarks/:bookmarkId", async (c) => {
    const listId = c.req.param("listId");
    const bookmarkId = c.req.param("bookmarkId");
    await c.var.api.lists.removeFromList({ listId, bookmarkId });
    return c.body(null, 204);
  });

export default app;
