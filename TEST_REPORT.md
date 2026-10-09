# SUH LeadFlow — integration test report

Date: 2026-10-09 · Branch: `main` · Node 25.3.0 · Next 16.3.4

Every API route and every external provider the application talks to was put
under test. This report lists what was tested, what was broken, what was fixed,
and the two things that still cannot be verified here.

## 1. Scope

| Integration | Kind | Covered |
| --- | --- | --- |
| `/api/discover` | prospect search (OSM + Google Places) | yes |
| `/api/leads` | lead list and bulk import | yes |
| `/api/leads/[id]` | single-lead update and delete | yes |
| `/api/leads/[id]/activities` | activity log and follow-ups | yes |
| `/api/territories` | territory plans | yes |
| `/api/campaign-spend` | spend records | yes |
| `/api/settings` | workspace settings | yes |
| `/api/google-ads-leads` | Google Ads lead-form webhook | yes |
| `/api/web-search` | Google Custom Search | request contract only (no key) |
| `/api/locations/states` | CountriesNow state lookup | yes |
| photon.komoot.io `/api/` | location search, primary | yes, live |
| photon.komoot.io `/reverse` | business search, primary | yes, live |
| nominatim.openstreetmap.org | location search, fallback | yes, live |
| Overpass × 6 mirrors | business search, fallback | yes, live |
| places.googleapis.com | optional paid provider | request contract only (no key) |

## 2. Method

Three suites, 171 tests in all:

| Suite | Tests | What it does |
| --- | --- | --- |
| `npm test` | 56 | Provider contracts against a scripted `fetch`. No network. ~0.5s. |
| `npm run test:api` | 106 | Every route over HTTP against two real `next dev` servers. |
| `npm run test:live` | 9 | The real provider endpoints. |

The route suite starts **two** servers: one with a signed-in user, one
anonymous. That is what makes the authentication gate on each route an assertion
rather than an assumption.

## 3. Result

```
npm test          56 passed,   0 failed
npm run test:api 106 passed,   0 failed
npm run test:live  7 passed,   1 failed (external outage),  1 skipped (no key)
tsc --noEmit      clean
next build        clean
```

The single live failure is the Overpass mirror diagnostic. It reports true
external state, not a defect — see §5.

## 4. Defects found and fixed

### 4.1 Critical — prospect search was completely dead

**Photon answers HTTP 503 when a request carries no `User-Agent`, and Node's
`fetch` sends none.** Both of the designated primary providers were therefore
failing on every single call. Measured directly:

```
no headers  -> 503        UA only     -> 200
Accept only -> 503        Accept+UA   -> 200
```

Location search silently degraded to Nominatim (which did set a header).
Business search fell through to Overpass — which was down — so the feature
returned "temporarily unavailable" for every query. One default header in
`lib/discovery-http.ts` fixes both.

### 4.2 High — five routes accepted anonymous callers

`/api/leads` (GET, POST), `/api/leads/[id]` (PATCH, DELETE) and
`/api/web-search` (POST) had no authentication gate at all, while every
neighbouring route had one. Anyone who could reach the deployment could read
the whole lead database, insert records, delete records, and spend the Google
Custom Search quota. All five are now gated.

### 4.3 High — state suggestions never worked

`/api/locations/states` called `GET /countries/states`, which **ignores its
`country` parameter** and returns an array of every country. The code then read
`data.states`, which is `undefined` on an array, so the list was always empty
and the UI silently showed no suggestions. The per-country endpoint is
`/countries/states/q`. Now returns 37 states for India.

### 4.4 High — the fallback chain could report a false "nothing found"

The walk accepted the first mirror that answered `200`, even with
`elements: []`. Two mirrors do exactly that:

- `overpass.osm.ch` is a **Switzerland-only extract** — verified: Zurich
  returns 10 results, Greater Noida returns 0.
- `maps.mail.ru` returns **0 rows for every region tested** — Moscow,
  Greater Noida and London all came back empty.

An empty answer no longer ends the walk, `osm.ch` is excluded from the list,
and `maps.mail.ru` was demoted to last.

### 4.5 High — the fallback walk could outlive the request

Six mirrors at an 18-second timeout each is **108 seconds** before failing,
far past any serverless function limit, so the request would be killed rather
than returning an error. Each attempt is now 9s with a 27s overall budget.

### 4.6 Medium — three DELETE endpoints reported success for records that never existed

`DELETE /api/leads/[id]`, `/api/territories` and `/api/campaign-spend` all
returned `200 {deleted:true}` for an unknown id, which hides a stale UI from
the user. All three now return 404.

### 4.7 Medium — opt-in flags were silently discarded

`/api/settings` tested `body[field] === true`, so an API client sending
`googleAdsOptIn: 1` had it written as `0` with a `200` response and no warning.
The browser happened to send booleans, which is why this never surfaced in the
UI. Now accepts `true`, `1`, `"1"` and `"true"`.

### 4.8 Medium — Turso was a hard dependency of search

`env.DB!` threw a `TypeError` when `TURSO_DATABASE_URL` was unset, surfacing as
a generic 502. Result caching and the rate gate now degrade to no-ops, so
search works before the database is configured.

### 4.9 Low — duplicate candidates

OSM maps the same premises as both a node and a way, so the same business
appeared twice. Deduplicated by name and position: a live all-sectors search
goes from 47 raw rows to 45 candidates.

### 4.10 Low — Photon finding nothing was treated as "place does not exist"

A zero-result Photon response skipped the Nominatim fallback entirely. It now
falls through, so a gap in one index is not a dead end.

### 4.11 Infrastructure — two dev servers could not run side by side

They deadlocked over `.next`. `distDir` is now settable with `NEXT_DIST_DIR`,
which the suite uses and which also keeps test runs from disturbing a dev
server you already have open.

## 5. Still failing, and why

**Every public Overpass mirror is currently down.** Measured repeatedly over
this session:

| Mirror | Observed |
| --- | --- |
| `overpass.private.coffee` | HTTP 500 (Apache) |
| `overpass-api.de` | HTTP 504 / "server too busy" |
| `z.overpass-api.de` | timeout, occasionally 200 |
| `lz4.overpass-api.de` | HTTP 504 |
| `overpass.kumi.systems` | HTTP 500 |
| `maps.mail.ru` | HTTP 504, or 200 with 0 rows |

This is third-party infrastructure, not application code. **Search still works**
because Photon is the primary and Photon is healthy. The consequence is that
contact details are unavailable: Photon's reverse index carries no `phone`,
`website` or `email` tags, and Overpass — the provider that does — cannot
currently be reached. A live all-sectors search returned 45 businesses with
**0 contact details**.

## 6. Not verifiable here

| Integration | Why | What is covered |
| --- | --- | --- |
| Google Places text search | no `GOOGLE_PLACES_API_KEY` | request shape, field mask, page size, response mapping, error handling — 4 offline tests |
| Google Custom Search | no key or engine id | query building, result mapping, non-http link filtering, quota and bad-key errors — 9 offline tests |

Both are wired, typechecked and contract-tested; only a real credential can
confirm the account side (API enabled, billing, quota).

## 7. Running the suites

```bash
npm test           # 56 offline tests, no network
npm run test:api   # 106 route tests, starts two servers
npm run test:live  # 9 live provider tests
npm run typecheck
```

`npm run test:api` applies the migrations to throwaway `file:` databases and
starts both servers on random ports; nothing touches your own database or
`.next`.

## 8. Known issues not addressed

- **Production authentication.** The gates work, but nothing sets the `oai-*`
  identity headers outside the original ChatGPT Sites host, so on Vercel every
  gated route answers 401. `LOCAL_DEV_USER_EMAIL` covers local work only and is
  inert when `NODE_ENV=production`. A real identity provider is still needed.
- **`/api/locations/states` is intentionally ungated** — it is a public
  country-to-state lookup with no workspace data and an hour of cache.
- **Six pre-existing `react-hooks` lint errors** in `app/page.tsx` and
  `app/territory-panel.tsx`. Untouched; they predate this work.
- **`/api/leads` POST reads every existing lead** to build its duplicate index.
  Correct, but it will slow down as the table grows.
