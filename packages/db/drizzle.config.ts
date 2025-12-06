import "dotenv/config";

import type { Config } from "drizzle-kit";

import serverConfig from "@karakeep/shared/config";

const databaseURL = serverConfig.dataDir
  ? `${serverConfig.dataDir}/db.db`
  : "./db.db";

export default {
  dialect: "turso",
  schema: "./schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseURL,
  },
} satisfies Config;
