import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { Asset } from "@karakeep/trpc/models/assets";

import { apiKeyScopeMiddleware } from "../middlewares/apiKeyScopes";
import { authMiddleware } from "../middlewares/auth";
import { createRateLimitMiddleware } from "../middlewares/rateLimit";
import { serveAsset } from "../utils/assets";
import { uploadAsset } from "../utils/upload";

const app = new Hono()
  .use(authMiddleware)
  .post(
    "/",
    apiKeyScopeMiddleware("assets", "readwrite"),
    createRateLimitMiddleware({
      name: "assets.upload",
      windowMs: 60 * 1000,
      maxRequests: 30,
    }),
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
  .get("/:assetId", apiKeyScopeMiddleware("assets", "read"), async (c) => {
    const assetId = c.req.param("assetId");

    const asset = await Asset.fromId(c.var.ctx, assetId);
    await asset.ensureCanView();

    return await serveAsset(c, assetId, asset.asset.userId);
  });

export default app;
