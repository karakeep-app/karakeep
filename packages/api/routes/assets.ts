import { zValidator } from "@hono/zod-validator";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { assets } from "@karakeep/db/schema";
import { BareBookmark } from "@karakeep/trpc/models/bookmarks";

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
      where: eq(assets.id, assetId),
      columns: {
        id: true,
        userId: true,
        bookmarkId: true,
      },
    });

    if (!assetDb) {
      return c.json({ error: "Asset not found" }, { status: 404 });
    }

    // If asset is not attached to a bookmark yet, only owner can access it
    if (!assetDb.bookmarkId) {
      if (assetDb.userId !== c.var.ctx.user.id) {
        return c.json({ error: "Asset not found" }, { status: 404 });
      }
      return await serveAsset(c, assetId, assetDb.userId);
    }

    // If asset is attached to a bookmark, check bookmark access permissions
    try {
      // This throws if the user doesn't have access to the bookmark
      await BareBookmark.bareFromId(c.var.ctx, assetDb.bookmarkId);
    } catch (e) {
      if (e instanceof TRPCError && e.code === "FORBIDDEN") {
        return c.json({ error: "Asset not found" }, { status: 404 });
      }
      throw e;
    }

    return await serveAsset(c, assetId, assetDb.userId);
  });

export default app;
