import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import serverConfig from "@karakeep/shared/config";

import { db } from "./drizzle";

if (serverConfig.degradedMode) {
  console.log("Skipping database migrations in degraded mode");
} else {
  migrate(db, { migrationsFolder: "./drizzle" });
}
