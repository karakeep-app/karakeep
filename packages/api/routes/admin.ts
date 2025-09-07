import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { updateUserSchema } from "@karakeep/shared/types/admin";

import { adminAuthMiddleware } from "../middlewares/auth";

const app = new Hono()
  .use(adminAuthMiddleware)

  // PUT /admin/users/:userId
  .put("/users/:userId", zValidator("json", updateUserSchema), async (c) => {
    const userId = c.req.param("userId");
    const body = c.req.valid("json");

    // Ensure the userId from the URL matches the one in the body
    const input = { ...body, userId };

    await c.var.api.admin.updateUser(input);

    return c.json({ success: true }, 200);
  });

export default app;
