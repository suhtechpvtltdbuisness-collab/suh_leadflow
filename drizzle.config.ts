import { defineConfig } from "drizzle-kit";

// Turso is libSQL, so the existing SQLite migrations in ./drizzle apply as-is.
// `npm run db:migrate` pushes them with drizzle-orm's libSQL migrator.
export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "sqlite",
});
