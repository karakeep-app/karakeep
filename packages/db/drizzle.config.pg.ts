import "dotenv/config";

import type { Config } from "drizzle-kit";

import serverConfig, { buildPgConnectionString } from "@karakeep/shared/config";

const connectionString = buildPgConnectionString(serverConfig.database);

export default {
  dialect: "postgresql",
  schema: "./schema.pg.ts",
  out: "./migrations/pg",
  dbCredentials: {
    url: connectionString,
  },
} satisfies Config;
