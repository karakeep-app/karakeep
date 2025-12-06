import { migrate } from "drizzle-orm/libsql/migrator";

import { db } from "./drizzle";

migrate(db, { migrationsFolder: "./drizzle" });
