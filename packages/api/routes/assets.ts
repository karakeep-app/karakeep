import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { Asset } from "@karakeep/trpc/models/assets";

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

    const asset = await Asset.fromId(c.var.ctx, assetId);
    await asset.ensureCanView();

    return await serveAsset(c, assetId, asset.asset.userId);
  });

export default app;
