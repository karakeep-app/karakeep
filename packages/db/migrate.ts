import type { migrate as sqliteMigrate } from "drizzle-orm/better-sqlite3/migrator";
import type { migrate as pgMigrate } from "drizzle-orm/postgres-js/migrator";

import { db, dialect } from "./drizzle";

if (dialect === "postgresql") {
  const { migrate } =
    (await import("drizzle-orm/postgres-js/migrator")) as unknown as {
      migrate: typeof pgMigrate;
    };
  // At runtime db is a PostgresJsDatabase instance when dialect is "postgresql"
  await migrate(db as unknown as Parameters<typeof migrate>[0], {
    migrationsFolder: "./migrations/pg",
  });
  // postgres.js keeps the event loop alive; exit explicitly after migration.
  process.exit(0);
} else {
  const { migrate } =
    (await import("drizzle-orm/better-sqlite3/migrator")) as unknown as {
      migrate: typeof sqliteMigrate;
    };
  migrate(db, {
    migrationsFolder: "./migrations/sqlite",
  });
}
