import { zValidator } from "@hono/zod-validator";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { assets } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { verifySignedToken } from "@karakeep/shared/signedTokens";
import { zAssetSignedTokenSchema } from "@karakeep/shared/types/assets";
import { BareBookmark } from "@karakeep/trpc/models/bookmarks";

import { authMiddleware, unauthedMiddleware } from "../middlewares/auth";
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
  .get(
    "/:assetId",
    unauthedMiddleware,
    zValidator(
      "query",
      z.object({
        token: z.string().optional(),
      }),
    ),
    async (c) => {
      const assetId = c.req.param("assetId");
      const query = c.req.valid("query");

      // If a signed token is provided, use token-based authentication
      if (query.token) {
        const tokenPayload = verifySignedToken(
          query.token,
          serverConfig.signingSecret(),
          zAssetSignedTokenSchema,
        );
        if (!tokenPayload) {
          return c.json({ error: "Invalid or expired token" }, { status: 403 });
        }
        if (tokenPayload.assetId !== assetId) {
          return c.json({ error: "Invalid or expired token" }, { status: 403 });
        }
        const userId = tokenPayload.userId;

        const assetDb = await c.var.ctx.db.query.assets.findFirst({
          where: and(eq(assets.id, assetId), eq(assets.userId, userId)),
        });

        if (!assetDb) {
          return c.json({ error: "Asset not found" }, { status: 404 });
        }
        return await serveAsset(c, assetId, userId);
      }

      // Otherwise, use session-based authentication
      if (!c.var.ctx.user) {
        return c.json({ error: "Unauthorized" }, { status: 401 });
      }

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
    },
  );

export default app;
