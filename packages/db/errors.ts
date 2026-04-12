import { SqliteError } from "better-sqlite3";

export function isUniqueConstraintError(e: unknown): boolean {
  // SQLite: SQLITE_CONSTRAINT_UNIQUE or SQLITE_CONSTRAINT_PRIMARYKEY
  if (e instanceof SqliteError) {
    return (
      e.code === "SQLITE_CONSTRAINT_UNIQUE" ||
      e.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
    );
  }
  // PostgreSQL (postgres.js): error code "23505" is unique_violation
  if (
    e != null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "23505"
  ) {
    return true;
  }
  return false;
}
