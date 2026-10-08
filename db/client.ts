import { createClient, type Client, type InStatement, type InValue } from "@libsql/client";

/**
 * Turso/libSQL access behind the same surface the route handlers already use.
 * The handlers were written against Cloudflare D1 (`prepare().bind().all()`),
 * so this keeps their SQL and call sites unchanged on Vercel.
 */

export type SqlMeta = {
  changes: number;
  last_row_id: number;
  duration: number;
  rows_read: number;
  rows_written: number;
};

export type SqlResult<T = Record<string, unknown>> = {
  results: T[];
  success: true;
  meta: SqlMeta;
};

export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<SqlResult<T>>;
  run<T = Record<string, unknown>>(): Promise<SqlResult<T>>;
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  batch<T = Record<string, unknown>>(
    statements: SqlStatement[],
  ): Promise<SqlResult<T>[]>;
}

function toInValue(value: unknown): InValue {
  // D1 tolerates `undefined` in bindings; libSQL rejects anything non-null.
  if (value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  return value as InValue;
}

function rowsToObjects<T>(columns: string[], rows: readonly unknown[][]): T[] {
  return rows.map((row) => {
    const record: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      record[column] = row[index];
    });
    return record as T;
  });
}

function toResult<T>(
  columns: string[],
  rows: readonly unknown[][],
  rowsAffected: number,
  lastInsertRowid: bigint | undefined,
): SqlResult<T> {
  return {
    results: rowsToObjects<T>(columns, rows),
    success: true,
    meta: {
      changes: rowsAffected,
      last_row_id: lastInsertRowid === undefined ? 0 : Number(lastInsertRowid),
      duration: 0,
      rows_read: rows.length,
      rows_written: rowsAffected,
    },
  };
}

class LibSqlStatement implements SqlStatement {
  constructor(
    private readonly client: Client,
    readonly sql: string,
    readonly args: InValue[] = [],
  ) {}

  bind(...values: unknown[]): SqlStatement {
    return new LibSqlStatement(this.client, this.sql, values.map(toInValue));
  }

  get statement(): InStatement {
    return { sql: this.sql, args: this.args };
  }

  private async execute<T>(): Promise<SqlResult<T>> {
    const result = await this.client.execute(this.statement);
    return toResult<T>(
      result.columns,
      result.rows as unknown as unknown[][],
      result.rowsAffected,
      result.lastInsertRowid,
    );
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const { results } = await this.execute<Record<string, unknown>>();
    const row = results[0];
    if (!row) return null;
    return (column === undefined ? row : row[column]) as T;
  }

  async all<T = Record<string, unknown>>(): Promise<SqlResult<T>> {
    return this.execute<T>();
  }

  async run<T = Record<string, unknown>>(): Promise<SqlResult<T>> {
    return this.execute<T>();
  }
}

class LibSqlDatabase implements SqlDatabase {
  constructor(private readonly client: Client) {}

  prepare(sql: string): SqlStatement {
    return new LibSqlStatement(this.client, sql);
  }

  async batch<T = Record<string, unknown>>(
    statements: SqlStatement[],
  ): Promise<SqlResult<T>[]> {
    // "write" matches D1's all-or-nothing batch semantics.
    const results = await this.client.batch(
      statements.map((statement) => (statement as LibSqlStatement).statement),
      "write",
    );
    return results.map((result) =>
      toResult<T>(
        result.columns,
        result.rows as unknown as unknown[][],
        result.rowsAffected,
        result.lastInsertRowid,
      ),
    );
  }
}

export function createLibSqlClient(): Client | null {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) return null;
  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

// Reused across requests, and across HMR reloads in development.
const globalForDb = globalThis as typeof globalThis & {
  __libsqlClient?: Client | null;
  __sqlDatabase?: SqlDatabase | null;
};

export function getLibSqlClient(): Client | null {
  if (globalForDb.__libsqlClient === undefined) {
    globalForDb.__libsqlClient = createLibSqlClient();
  }
  return globalForDb.__libsqlClient;
}

/** `null` when Turso is not configured, so handlers keep their 503 paths. */
export function getDatabase(): SqlDatabase | null {
  if (globalForDb.__sqlDatabase === undefined) {
    const client = getLibSqlClient();
    globalForDb.__sqlDatabase = client ? new LibSqlDatabase(client) : null;
  }
  return globalForDb.__sqlDatabase;
}
