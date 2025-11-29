import { Hono } from "hono";

import { authMiddleware } from "../middlewares/auth";

const app = new Hono()
  .use(authMiddleware)

  // GET /backups
  .get("/", async (c) => {
    const backups = await c.var.api.backups.list();
    return c.json(backups, 200);
  })

  // POST /backups
  .post("/", async (c) => {
    const backup = await c.var.api.backups.triggerBackup();
    return c.json(backup, 201);
  })

  // GET /backups/[backupId]
  .get("/:backupId", async (c) => {
    const backupId = c.req.param("backupId");
    const backup = await c.var.api.backups.get({ backupId });
    return c.json(backup, 200);
  })

  // GET /backups/[backupId]/download
  .get("/:backupId/download", async (c) => {
    const backupId = c.req.param("backupId");
    const backup = await c.var.api.backups.get({ backupId });
    if (!backup.assetId) {
      return c.json({ error: "Backup not found" }, 404);
    }
    return c.redirect(`/api/assets/${backup.assetId}`);
  })

  // DELETE /backups/[backupId]
  .delete("/:backupId", async (c) => {
    const backupId = c.req.param("backupId");
    await c.var.api.backups.delete({ backupId });
    return c.body(null, 204);
  });

export default app;
