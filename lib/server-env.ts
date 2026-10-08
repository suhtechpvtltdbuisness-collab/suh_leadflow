import { getDatabase, type SqlDatabase } from "@/db/client";

/**
 * Stands in for the Workers `cloudflare:workers` binding object this app was
 * generated against: `DB` is the Turso-backed database, every other key reads
 * through to `process.env` (Vercel project environment variables).
 */
export interface ServerEnv {
  readonly DB: SqlDatabase | null;
  readonly [key: string]: unknown;
}

export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, property) {
    if (property === "DB") return getDatabase();
    if (typeof property !== "string") return undefined;
    return process.env[property];
  },
});
