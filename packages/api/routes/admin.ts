import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import {
  resetPasswordSchema,
  updateUserSchema,
  zAdminCreateUserSchema,
} from "@karakeep/shared/types/admin";

import { adminAuthMiddleware } from "../middlewares/auth";

const app = new Hono()
  .use(adminAuthMiddleware)

  // GET /admin/users/stats
  .get("/users/stats", async (c) => {
    const result = await c.var.api.admin.userStats();
    return c.json(result, 200);
  })

  // POST /admin/users
  .post("/users", zValidator("json", zAdminCreateUserSchema), async (c) => {
    const body = c.req.valid("json");
    const result = await c.var.api.admin.createUser(body);
    return c.json(result, 201);
  })

  // PUT /admin/users/:userId
  .put(
    "/users/:userId",
    zValidator("json", updateUserSchema.omit({ userId: true })),
    async (c) => {
      const userId = c.req.param("userId");
      const body = c.req.valid("json");

      // Ensure the userId from the URL matches the one in the body
      const input = { ...body, userId };

      await c.var.api.admin.updateUser(input);

      return c.json({ success: true }, 200);
    },
  )

  // PUT /admin/users/:userId/password
  .put(
    "/users/:userId/password",
    zValidator("json", resetPasswordSchema.omit({ userId: true })),
    async (c) => {
      const userId = c.req.param("userId");
      const body = c.req.valid("json");

      const input = { ...body, userId };

      await c.var.api.admin.resetPassword(input);

      return c.json({ success: true }, 200);
    },
  )

  // POST /admin/invites
  .post(
    "/invites",
    zValidator(
      "json",
      z.object({
        email: z.string().email(),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const result = await c.var.api.invites.create(body);
      return c.json(result, 201);
    },
  )

  // GET /admin/invites
  .get("/invites", async (c) => {
    const result = await c.var.api.invites.list();
    return c.json(result, 200);
  })

  // DELETE /admin/invites/:inviteId
  .delete("/invites/:inviteId", async (c) => {
    const inviteId = c.req.param("inviteId");
    await c.var.api.invites.revoke({ inviteId });
    return c.json({ success: true }, 200);
  })

  // POST /admin/invites/:inviteId/resend
  .post("/invites/:inviteId/resend", async (c) => {
    const inviteId = c.req.param("inviteId");
    const result = await c.var.api.invites.resend({ inviteId });
    return c.json(result, 200);
  });

export default app;
