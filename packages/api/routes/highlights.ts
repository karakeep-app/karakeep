import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  zNewHighlightSchema,
  zUpdateHighlightSchema,
} from "@karakeep/shared/types/highlights";

import { authMiddleware } from "../middlewares/auth";
import { adaptPagination, zPagination } from "../utils/pagination";

const app = new Hono()
  .use(authMiddleware)
  .get("/", zValidator("query", zPagination), async (c) => {
    const searchParams = c.req.valid("query");
    const resp = await c.var.api.highlights.getAll({
      ...searchParams,
    });
    return c.json(adaptPagination(resp));
  })
  .post("/", zValidator("json", zNewHighlightSchema), async (c) => {
    const body = c.req.valid("json");
    const resp = await c.var.api.highlights.create(body);
    return c.json(resp, 201);
  })
  .get("/:highlightId", async (c) => {
    const highlightId = c.req.param("highlightId");
    const highlight = await c.var.api.highlights.get({
      highlightId,
    });
    return c.json(highlight, 200);
  })
  .patch(
    "/:highlightId",
    zValidator("json", zUpdateHighlightSchema.omit({ highlightId: true })),
    async (c) => {
      const highlightId = c.req.param("highlightId");
      const body = c.req.valid("json");
      const highlight = await c.var.api.highlights.update({
        highlightId,
        ...body,
      });
      return c.json(highlight, 200);
    },
  )
  .delete("/:highlightId", async (c) => {
    const highlightId = c.req.param("highlightId");
    const highlight = await c.var.api.highlights.delete({
      highlightId,
    });
    return c.json(highlight, 200);
  });

export default app;
