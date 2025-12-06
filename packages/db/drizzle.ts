import "dotenv/config";

import path from "path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import serverConfig from "@karakeep/shared/config";

import dbConfig from "./drizzle.config";
import * as schema from "./schema";

const client = createClient({
  url: `file:${dbConfig.dbCredentials.url}`,
});

export const db = drizzle(client, { schema });
export type DB = typeof db;

export async function getInMemoryDB(runMigrations: boolean) {
  const memClient = createClient({
    url: ":memory:",
  });
  const db = drizzle(memClient, { schema });
  if (runMigrations) {
    // Run migrations using drizzle-orm/libsql migrate function
    const { migrate } = await import("drizzle-orm/libsql/migrator");
    await migrate(db, {
      migrationsFolder: path.resolve(__dirname, "./drizzle"),
    });
  }
  return db;
}
