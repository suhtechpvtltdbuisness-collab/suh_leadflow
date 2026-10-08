# SUH LeadFlow — source code package

This package contains the source of the published SUH LeadFlow version 12.

## Included features
- Prospect search across 36 business sectors and All relevant businesses.
- Location and radius search, provider fallback, source links and bulk prospect intake.
- Lead inbox, pipeline, ownership, follow-ups and activity history.
- Countries/states/regions, territory plans and campaign-to-revenue reporting.
- CSV import/export, Google Ads webhook intake and ad-account preferences.
- Database schema and all SQL migrations.

## Local setup
1. Install Node.js 22.13 or newer and pnpm.
2. Open a terminal in the extracted SUH_LeadFlow folder.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm build` to generate the Worker configuration.
5. For a new local database, apply every SQL file in `drizzle/`, from 0000 through 0006, in filename order, using:
   `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/FILE.sql`
   Replace FILE.sql with each actual filename. Do not replay migrations on an existing database.
6. Run `pnpm dev`. Open the address printed in the terminal (normally http://localhost:5173).
7. Local portable development supports simulated sign-in through `/signin-with-chatgpt?return_to=/`.

## Hosting
This is a Vinext/React application built for Cloudflare Workers and D1 through Sites. The existing project identifier is retained in `.openai/hosting.json`. The published workspace is private and uses dispatch-owned ChatGPT sign-in.
It is not a standalone Vercel-ready package. Hosting elsewhere requires replacing the identity integration, configuring a database and adapting the runtime. Never expose the application publicly with trusted identity headers accepted from arbitrary clients.
See README.md for the runtime, authentication and migration details.

## Provider configuration
Public OpenStreetMap/Photon search can run without an API key. Its coverage and availability vary; phone/email/website may be absent, and results are candidates requiring qualification.
Optional server-side runtime secrets:
- GOOGLE_PLACES_API_KEY — Places API (New), with API enabled and billing configured.
- GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID — existing Custom Search JSON API customer configuration.
- GOOGLE_ADS_WEBHOOK_KEY — shared webhook validation secret.
Optional server settings: NOMINATIM_URL and OVERPASS_URL.
Store real credentials only in server-side secrets. No real API keys are included.

Google Places results are for live review and are not bulk-imported into the CRM. Google Ads webhook delivery needs a configured reachable endpoint. Meta automatic retrieval and account OAuth are not implemented; IDs/preferences and reviewed CSV imports are available.

## Package contents
Application source, components, styles, provider helpers, schema, migrations, public assets, scripts, package.json and pnpm lockfile. Dependencies, generated builds, Git history, local database records and runtime secrets are excluded.
