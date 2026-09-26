import { Hono } from "hono";
import { beforeEach, expect, test } from "vitest";

import type { Context } from "@karakeep/trpc";
import type { CustomTestContext } from "@karakeep/trpc/testUtils";
import { defaultBeforeEach } from "@karakeep/trpc/testUtils";

import trpcAdapter from "../middlewares/trpcAdapter";
import bookmarks from "./bookmarks";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

test<CustomTestContext>("custom metadata survives the HTTP create, patch and get routes", async ({
  db,
}) => {
  const user = (await db.query.users.findFirst())!;
  const app = new Hono<{ Variables: { ctx: Context } }>();
  app.use(async (c, next) => {
    c.set("ctx", {
      db,
      user: { id: user.id, role: "user" },
      auth: { type: "session" },
      req: { ip: null },
    });
    await next();
  });
  app.use(trpcAdapter).route("/bookmarks", bookmarks);
  const created = await app.request("/bookmarks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "text",
      text: "HTTP test",
      customMetadata: { first: 1, second: 2 },
    }),
  });
  expect(created.status).toBe(201);
  const body = await created.json();
  const patched = await app.request(`/bookmarks/${body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customMetadata: { first: null, nested: { enabled: true } },
    }),
  });
  expect(patched.status).toBe(200);
  const fetched = await app.request(`/bookmarks/${body.id}`);
  expect(fetched.status).toBe(200);
  expect((await fetched.json()).customMetadata).toEqual({
    second: 2,
    nested: { enabled: true },
  });
  const invalid = await app.request(`/bookmarks/${body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customMetadata: { value: "x".repeat(17000) } }),
  });
  expect(invalid.status).toBe(400);
});
