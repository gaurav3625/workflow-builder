export function isDatabaseConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return (
    message.includes("Can't reach database server") ||
    message.includes("PrismaClientInitializationError") ||
    message.includes("Timed out fetching a new connection") ||
    message.includes("Connection terminated") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND")
  );
}

/**
 * Detects a Prisma "table/column does not exist" error (P2021 / P2022).
 * This is a schema/migration problem, not a transient connection issue, and it
 * must never be silently swallowed as a 500 — it means a migration is missing
 * on the target database (e.g. `prisma migrate deploy` was not run in production).
 */
export function isMissingSchemaError(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code ?? "")
      : "";
  if (code === "P2021" || code === "P2022") return true;

  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("does not exist in the current database") ||
    message.includes("The table") && message.includes("does not exist")
  );
}

export function databaseUnavailableMessage() {
  return "Database connection unavailable. Check DATABASE_URL and make sure the database server is reachable.";
}

export function schemaOutOfDateMessage() {
  return "The database is missing a required table. A migration has not been applied to this database (run `prisma migrate deploy`).";
}
