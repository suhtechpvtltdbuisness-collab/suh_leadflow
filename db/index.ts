import { drizzle } from "drizzle-orm/libsql";
import { getLibSqlClient } from "./client";
import * as schema from "./schema";

export function getDb() {
  const client = getLibSqlClient();
  if (!client) {
    throw new Error(
      "Turso is unavailable. Set `TURSO_DATABASE_URL` (and `TURSO_AUTH_TOKEN` for remote databases) in your environment before using the database."
    );
  }

  return drizzle(client, { schema });
}
