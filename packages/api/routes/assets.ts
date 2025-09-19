import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { assets } from "@karakeep/db/schema";

import { authMiddleware } from "../middlewares/auth";
import { serveAsset } from "../utils/assets";
import { uploadAsset } from "../utils/upload";

const app = new Hono()
  .use(authMiddleware)
  .post(
    "/",
    zValidator(
      "form",
      z
        .object({ file: z.instanceof(File) })
        .or(z.object({ image: z.instanceof(File) })),
    ),
    async (c) => {
      const body = c.req.valid("form");
      const up = await uploadAsset(c.var.ctx.user, c.var.ctx.db, body);
      if ("error" in up) {
        return c.json({ error: up.error }, up.status);
      }
      return c.json({
        assetId: up.assetId,
        contentType: up.contentType,
        size: up.size,
        fileName: up.fileName,
      });
    },
  )
  .get("/:assetId", async (c) => {
    const assetId = c.req.param("assetId");
    const assetDb = await c.var.ctx.db.query.assets.findFirst({
      where: and(eq(assets.id, assetId), eq(assets.userId, c.var.ctx.user.id)),
    });

    if (!assetDb) {
      return c.json({ error: "Asset not found" }, { status: 404 });
    }
    return await serveAsset(c, assetId, c.var.ctx.user.id);
  });

export default app;
