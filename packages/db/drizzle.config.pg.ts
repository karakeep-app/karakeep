import "dotenv/config";

import type { Config } from "drizzle-kit";

import serverConfig from "@karakeep/shared/config";

const dbConfig = serverConfig.database;
const connectionString =
  dbConfig.url ??
  `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`;

export default {
  dialect: "postgresql",
  schema: "./schema.pg.ts",
  out: "./migrations/pg",
  dbCredentials: {
    url: connectionString,
  },
} satisfies Config;
