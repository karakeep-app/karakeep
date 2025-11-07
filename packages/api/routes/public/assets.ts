import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { assets } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { verifySignedToken } from "@karakeep/shared/signedTokens";
import { zAssetSignedTokenSchema } from "@karakeep/shared/types/assets";

import { unauthedMiddleware } from "../../middlewares/auth";
import { serveAsset } from "../../utils/assets";

const app = new Hono()
  // Public assets, they require signed token for auth
  .get(
    "/:assetId",
    unauthedMiddleware,
    zValidator(
      "query",
      z.object({
        token: z.string(),
      }),
    ),
    async (c) => {
      const assetId = c.req.param("assetId");
      const tokenPayload = verifySignedToken(
        c.req.valid("query").token,
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
    },
  );

export default app;
