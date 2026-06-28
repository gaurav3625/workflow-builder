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

export function databaseUnavailableMessage() {
  return "Database connection unavailable. Check DATABASE_URL and make sure the database server is reachable.";
}
