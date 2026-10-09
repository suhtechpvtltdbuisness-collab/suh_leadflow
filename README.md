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

Prospect search is gated on a signed-in user, and nothing sets the identity
headers locally, so set `LOCAL_DEV_USER_EMAIL` in `.env` to use it:

```bash
LOCAL_DEV_USER_EMAIL="you@example.com"
```

## Scripts

- `npm run dev` — development server on port 3000
- `npm run build` — production build into `.next/`
- `npm start` — serve the production build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — offline provider contract suite
- `npm run test:live` — the real provider endpoints
- `npm run test:api` — the routes over HTTP against a real server
- `npm run db:generate` — generate a migration from `db/schema.ts`
- `npm run db:migrate` — apply pending migrations to `TURSO_DATABASE_URL`

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | for the CRM | libSQL connection string. Leads, territories, settings and reporting return 503 without it. Prospect search works without it, but loses result caching and the rate gate. |
| `TURSO_AUTH_TOKEN` | remote only | Turso auth token; omit for `file:` URLs. |
| `LOCAL_DEV_USER_EMAIL` | local only | Stands in for the `oai-*` identity headers so the gated routes work locally. Ignored when `NODE_ENV=production`. |
| `DISCOVERY_USER_AGENT` | no | Contact string sent to the public OSM services. A default is always sent — see below. |
| `NOMINATIM_URL` | no | Self-hosted geocoder in place of the public Nominatim. |
| `OVERPASS_URL` | no | Self-hosted Overpass, tried ahead of the public mirrors. |
| `GOOGLE_PLACES_API_KEY` | no | Enables the Google Places option in prospect search. |
| `GOOGLE_CUSTOM_SEARCH_API_KEY` | no | Enables `/api/web-search`. |
| `GOOGLE_SEARCH_ENGINE_ID` | no | Enables `/api/web-search`. |
| `GOOGLE_ADS_WEBHOOK_KEY` | no | Shared secret for the `/api/google-ads-leads` webhook. |

Each integration route reports "not configured" (503) until its keys are set, so
the app runs without them.

## Search providers

Prospect search runs on free OpenStreetMap services and needs no API key. The
provider layer lives in `lib/discovery-providers.ts`; `app/api/discover/route.ts`
only orchestrates it, so each provider can be tested on its own.

| Purpose | Endpoint | Role |
| --- | --- | --- |
| Location search | `https://photon.komoot.io/api/` | primary |
| Location search | `https://nominatim.openstreetmap.org/search` | fallback (`NOMINATIM_URL`) |
| Nearby business search | `https://photon.komoot.io/reverse` | primary |
| Business search | `https://overpass.private.coffee/api/interpreter` | fallback (`OVERPASS_URL` is tried first) |
| Business search | `overpass-api.de`, `z.`, `lz4.`, `kumi.systems`, `maps.mail.ru` | further fallbacks, in that order |
| Business search | `https://places.googleapis.com/v1/places:searchText` | optional, billed, needs `GOOGLE_PLACES_API_KEY` |
| State suggestions | `https://countriesnow.space/api/v0.1/countries/states/q` | used by `/api/locations/states` |

Three things about these services are worth knowing before changing this code:

- **A `User-Agent` is mandatory.** Photon answers `503` and Overpass answers
  `406` when the header is absent, and Node's `fetch` sends none by default.
  `lib/discovery-http.ts` therefore sets one on every provider request.
- **Photon's reverse index carries no contact tags.** It is fast and reliable
  but returns no phone, website or email, so those searches come back flagged
  as `basicListings` and the UI warns that contact details may be missing.
  Overpass does return contact tags, and is used when Photon finds nothing.
- **Some public Overpass mirrors answer `200` with an empty result** rather
  than an error — a regional extract such as `overpass.osm.ch` does this for
  anywhere outside its own country. An empty answer therefore does not end the
  fallback walk, and only global-coverage mirrors belong in the list.

## Testing

```bash
npm test          # 56 provider contract tests, offline     (~0.5s)
npm run test:api  # 106 route tests over HTTP               (~60s)
npm run test:live # 9 live provider tests                   (~80s)
npm run typecheck # tsc --noEmit
```

`npm test` needs no network and is the suite to run while editing: it drives
every provider through a scripted `fetch`, covering success, each fallback hop,
HTML error pages, rate limits and the time budget.

`npm run test:api` applies the migrations to two throwaway `file:` databases and
starts **two** `next dev` servers on random ports — one with
`LOCAL_DEV_USER_EMAIL` set, one anonymous — so the authentication gate on every
route is asserted rather than assumed. Each server builds into its own
`NEXT_DIST_DIR`, so a run never disturbs the `.next` of a dev server you already
have open, and never touches your own database.

`npm run test:live` calls the real endpoints. It reports each Overpass mirror's
status and fails only when none of them answer, since these are shared community
services that go down independently of this code. It covers Google Places when
`GOOGLE_PLACES_API_KEY` is set and skips it otherwise.

The suites load the TypeScript in `lib/` through Node's built-in type stripping;
`tests/ts-resolve.mjs` maps the extensionless and `@/` specifiers that Next uses.
`tsconfig.json` lists the test build directories under `include` because Next
registers each `distDir` it generates types for.

See [TEST_REPORT.md](TEST_REPORT.md) for the latest full run, the defects it
found, and the two integrations that need a credential to verify.

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
- `lib/discovery-providers.ts` — the search providers, with an injectable `fetch`
- `lib/discovery-http.ts` — provider HTTP: `User-Agent`, timeouts, HTML-page guards
- `drizzle/` — generated SQL migrations
- `tests/` — provider, live-provider and route suites
- `TEST_REPORT.md` — findings from the last full integration run

## Note on authentication

`app/chatgpt-auth.ts` trusts the `oai-authenticated-user-id` and
`oai-authenticated-user-email` request headers. These were injected by the
ChatGPT Sites host this project was generated for. **Nothing sets them on
Vercel**, so the routes that gate on them always return 401, and the headers can
be forged by any caller. For local work, `LOCAL_DEV_USER_EMAIL` supplies a
signed-in user instead; it is ignored when `NODE_ENV=production`, so a deployed
build still needs real authentication before `/api/discover` will answer. `/api/leads`, `/api/leads/[id]`, `/api/web-search` and
`/api/locations/states` have no gate at all. Put real authentication in front of
these routes before exposing the deployment publicly.
