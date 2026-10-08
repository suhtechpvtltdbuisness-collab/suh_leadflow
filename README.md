# SUH LeadFlow

Lead discovery and pipeline tracking, built on Next.js 16 (App Router) with a
Turso (libSQL) database. Deploys to Vercel.

## Stack

- **Next.js 16.3.4** / React 19 — App Router, route handlers on the Node runtime
- **Turso (libSQL)** — SQLite-compatible database, accessed via `@libsql/client`
- **Drizzle** — schema in `db/schema.ts`, migrations in `drizzle/`
- **Tailwind CSS 4** + shadcn/ui components

## Local setup

```bash
npm install
cp .env.example .env     # then fill in TURSO_DATABASE_URL
npm run db:migrate       # apply drizzle/ migrations
npm run dev
```

For a local database with no Turso account, point at a file:

```bash
TURSO_DATABASE_URL="file:./local.db" npm run db:migrate
TURSO_DATABASE_URL="file:./local.db" npm run dev
```

## Scripts

- `npm run dev` — development server on port 3000
- `npm run build` — production build into `.next/`
- `npm start` — serve the production build
- `npm run lint` — ESLint
- `npm run db:generate` — generate a migration from `db/schema.ts`
- `npm run db:migrate` — apply pending migrations to `TURSO_DATABASE_URL`

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | yes | libSQL connection string. Without it every database route returns 503. |
| `TURSO_AUTH_TOKEN` | remote only | Turso auth token; omit for `file:` URLs. |
| `GOOGLE_CUSTOM_SEARCH_API_KEY` | no | Enables `/api/web-search`. |
| `GOOGLE_SEARCH_ENGINE_ID` | no | Enables `/api/web-search`. |
| `GOOGLE_ADS_WEBHOOK_KEY` | no | Shared secret for the `/api/google-ads-leads` webhook. |

Each integration route reports "not configured" (503) until its keys are set, so
the app runs without them.

## Deploying to Vercel

1. Create a Turso database and copy its URL and auth token:
   ```bash
   turso db create suh-leadflow
   turso db show suh-leadflow --url
   turso db tokens create suh-leadflow
   ```
2. Set the environment variables above in the Vercel project settings.
3. Apply migrations against the production database:
   ```bash
   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:migrate
   ```
4. Push the branch. Vercel detects Next.js and runs `next build` with no extra
   configuration — no custom build command or output directory is needed.

## Layout

- `app/` — pages and API route handlers
- `app/chatgpt-auth.ts` — reads `oai-authenticated-user-*` request headers (see note below)
- `db/client.ts` — libSQL client, exposed through a prepare/bind/batch helper
- `db/index.ts` — Drizzle instance for schema-typed queries
- `db/migrate.mjs` — migration runner used by `npm run db:migrate`
- `lib/server-env.ts` — `env.DB` plus pass-through access to `process.env`
- `drizzle/` — generated SQL migrations

## Note on authentication

`app/chatgpt-auth.ts` trusts the `oai-authenticated-user-id` and
`oai-authenticated-user-email` request headers. These were injected by the
ChatGPT Sites host this project was generated for. **Nothing sets them on
Vercel**, so the routes that gate on them always return 401, and the headers can
be forged by any caller. `/api/leads`, `/api/leads/[id]`, `/api/web-search` and
`/api/locations/states` have no gate at all. Put real authentication in front of
these routes before exposing the deployment publicly.
