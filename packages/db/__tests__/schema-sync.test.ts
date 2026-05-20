import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as pgSchema from "../schema.pg";
import * as schemaReExports from "../schema";
import * as sqliteSchema from "../schema.sqlite";

/**
 * Extract all table exports from a schema module.
 * Returns a map of export name → table object, filtering out non-table exports
 * (enums, helper functions, relation definitions, etc.).
 */
function getTableExports(mod: Record<string, unknown>) {
  const tables: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(mod)) {
    if (is(value, Table)) {
      tables[name] = value;
    }
  }
  return tables;
}

describe("Schema sync between SQLite and PostgreSQL", () => {
  const sqliteTables = getTableExports(sqliteSchema);
  const pgTables = getTableExports(pgSchema);
  const reExportedTables = getTableExports(schemaReExports);

  it("both schemas export the same set of table names", () => {
    const sqliteNames = Object.keys(sqliteTables).sort();
    const pgNames = Object.keys(pgTables).sort();
    expect(pgNames).toEqual(sqliteNames);
  });

  it("schema.ts re-exports every table from the dialect schemas", () => {
    const sqliteNames = Object.keys(sqliteTables).sort();
    const reExportedNames = Object.keys(reExportedTables).sort();
    expect(reExportedNames).toEqual(sqliteNames);
  });

  it("every table maps to the same SQL table name in both dialects", () => {
    for (const name of Object.keys(sqliteTables)) {
      const sqliteTableName = getTableName(sqliteTables[name] as Table);
      const pgTableName = getTableName(pgTables[name] as Table);
      expect(
        pgTableName,
        `Table export "${name}" has mismatched SQL table name`,
      ).toBe(sqliteTableName);
    }
  });

  it("every table has the same columns in both dialects", () => {
    for (const name of Object.keys(sqliteTables)) {
      const sqliteCols = Object.keys(
        getTableColumns(sqliteTables[name] as Table),
      ).sort();
      const pgCols = Object.keys(
        getTableColumns(pgTables[name] as Table),
      ).sort();
      expect(pgCols, `Column mismatch in table "${name}"`).toEqual(sqliteCols);
    }
  });
});
