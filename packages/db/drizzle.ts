import "dotenv/config";

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import serverConfig from "@karakeep/shared/config";

import dbConfig from "./drizzle.config";
import * as schema from "./schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = createClient({
  url: `file:${dbConfig.dbCredentials.url}`,
});

async function configurePragmas() {
  const pragmas: { sql: string }[] = [];

  if (serverConfig.database.walMode) {
    pragmas.push({ sql: "PRAGMA journal_mode = WAL" });
    pragmas.push({ sql: "PRAGMA synchronous = NORMAL" });
  } else {
    pragmas.push({ sql: "PRAGMA journal_mode = DELETE" });
  }

  pragmas.push(
    { sql: "PRAGMA cache_size = -65536" },
    { sql: "PRAGMA foreign_keys = ON" },
    { sql: "PRAGMA temp_store = MEMORY" },
  );

  await client.batch(pragmas);
}

await configurePragmas();

export const db = drizzle(client, { schema });
export type DB = typeof db;

let tempDbRoot: string | undefined;
const memClients = new Set<ReturnType<typeof createClient>>();
let exitHandlerRegistered = false;

function ensureTempDbRoot() {
  if (!tempDbRoot) {
    tempDbRoot = fs.mkdtempSync(path.join(os.tmpdir(), "karakeep-test-"));
  }
  return tempDbRoot;
}

function registerExitHandler() {
  if (typeof process === "undefined" || exitHandlerRegistered) {
    return;
  }

  process.on("exit", () => {
    memClients.forEach((memClient) => {
      try {
        memClient.close();
      } catch {
        // Ignore cleanup errors
      }
    });

    if (tempDbRoot && fs.existsSync(tempDbRoot)) {
      try {
        fs.rmSync(tempDbRoot, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  exitHandlerRegistered = true;
}

export async function getInMemoryDB(runMigrations: boolean) {
  // Use a temporary file instead of :memory: to avoid issues with
  // multiple connections in tests when vi.mock is used
  const tempFile = path.join(
    ensureTempDbRoot(),
    `karakeep-test-${crypto.randomBytes(8).toString("hex")}.db`,
  );

  const memClient = createClient({
    url: `file:${tempFile}`,
  });
  const db = drizzle(memClient, { schema, logger: false });

  if (runMigrations) {
    await migrate(db, {
      migrationsFolder: path.resolve(__dirname, "./drizzle"),
    });
  }

  memClients.add(memClient);
  registerExitHandler();

  return db;
}
