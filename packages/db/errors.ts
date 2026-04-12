export function isUniqueConstraintError(e: unknown): boolean {
  if (e == null || typeof e !== "object" || !("code" in e)) {
    return false;
  }
  const code = (e as { code: string }).code;
  // SQLite: SQLITE_CONSTRAINT_UNIQUE or SQLITE_CONSTRAINT_PRIMARYKEY
  // PostgreSQL: 23505 (unique_violation)
  return (
    code === "SQLITE_CONSTRAINT_UNIQUE" ||
    code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
    code === "23505"
  );
}
