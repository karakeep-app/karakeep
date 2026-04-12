import { createRequire } from "node:module";

import type { migrate as sqliteMigrate } from "drizzle-orm/better-sqlite3/migrator";
import type { migrate as pgMigrate } from "drizzle-orm/postgres-js/migrator";

import { db, dialect } from "./drizzle";

const require = createRequire(import.meta.url);

if (dialect === "postgresql") {
  const { migrate } = require("drizzle-orm/postgres-js/migrator") as {
    migrate: typeof pgMigrate;
  };
  // At runtime db is a PostgresJsDatabase instance when dialect is "postgresql"
  await migrate(db as unknown as Parameters<typeof migrate>[0], {
    migrationsFolder: "./migrations/pg",
  });
} else {
  const { migrate } = require("drizzle-orm/better-sqlite3/migrator") as {
    migrate: typeof sqliteMigrate;
  };
  migrate(db, {
    migrationsFolder: "./migrations/sqlite",
  });
}
