import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { db } from "./drizzle";

migrate(db, { migrationsFolder: "./drizzle" });
