import type { AnyColumn } from "drizzle-orm";
import { sql, SQL } from "drizzle-orm";

import { dialect } from "./drizzle";

/**
 * Extracts the domain (hostname) from a URL column, stripping the protocol
 * and path. Works across both SQLite and PostgreSQL.
 */
export function domainFromUrl(urlColumn: AnyColumn): SQL<string> {
  if (dialect === "postgresql") {
    // PostgreSQL: use substring with regex to extract host
    return sql`substring(${urlColumn} from '://([^/]+)')`;
  }
  // SQLite: use INSTR/SUBSTR to extract host
  return sql`CASE
    WHEN ${urlColumn} LIKE 'https://%' THEN
      CASE
        WHEN INSTR(SUBSTR(${urlColumn}, 9), '/') > 0 THEN
          SUBSTR(${urlColumn}, 9, INSTR(SUBSTR(${urlColumn}, 9), '/') - 1)
        ELSE
          SUBSTR(${urlColumn}, 9)
      END
    WHEN ${urlColumn} LIKE 'http://%' THEN
      CASE
        WHEN INSTR(SUBSTR(${urlColumn}, 8), '/') > 0 THEN
          SUBSTR(${urlColumn}, 8, INSTR(SUBSTR(${urlColumn}, 8), '/') - 1)
        ELSE
          SUBSTR(${urlColumn}, 8)
      END
    ELSE
      ${urlColumn}
    END`;
}
