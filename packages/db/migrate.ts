import { migrate } from "drizzle-orm/libsql/migrator";

import { db } from "./drizzle";

await migrate(db, { migrationsFolder: "./drizzle" });
