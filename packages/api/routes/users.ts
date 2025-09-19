import { Hono } from "hono";

import { authMiddleware } from "../middlewares/auth";

const app = new Hono()
  .use(authMiddleware)

  // GET /users/me
  .get("/me", async (c) => {
    const user = await c.var.api.users.whoami();
    return c.json(user, 200);
  })

  // GET /users/me/stats
  .get("/me/stats", async (c) => {
    const stats = await c.var.api.users.stats();
    return c.json(stats, 200);
  });

export default app;
