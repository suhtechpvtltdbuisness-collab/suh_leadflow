import { NextResponse } from "next/server";
import { categoryTags } from "@/lib/business-categories";
import { DiscoveryProviderError } from "@/lib/discovery-http";
import {
  LIMIT_CHOICES,
  RADIUS_CHOICES,
  findNearbyBusinesses,
  geocodeLocation,
  searchGooglePlaces,
  toCandidates,
  type GeoPoint,
  type ProviderOptions,
} from "@/lib/discovery-providers";
import { env } from "@/lib/server-env";
import { getChatGPTUser } from "../../chatgpt-auth";

type Secrets = { GOOGLE_PLACES_API_KEY?: string; NOMINATIM_URL?: string; OVERPASS_URL?: string };
const config = () => env as unknown as Secrets;

const GEOCODE_TTL_MS = 86_400_000;
const RESULT_TTL_MS = 900_000;
const RATE_WINDOW_MS = 60_000;

/**
 * Caching and the one-search-per-second gate both live in `discovery_cache`.
 * Turso is optional for discovery, so every access degrades to a no-op rather
 * than failing the search when `TURSO_DATABASE_URL` is unset.
 */
async function cacheGet(key: string): Promise<string | null> {
  const db = env.DB;
  if (!db) return null;
  try {
    const row = await db.prepare("SELECT payload FROM discovery_cache WHERE cache_key=? AND expires_at>?").bind(key, Date.now()).first<{ payload: string }>();
    return row?.payload ?? null;
  } catch {
    return null;
  }
}

async function cachePut(key: string, payload: string, ttlMs: number): Promise<void> {
  const db = env.DB;
  if (!db) return;
  try {
    await db.prepare("INSERT OR REPLACE INTO discovery_cache(cache_key,payload,expires_at) VALUES(?,?,?)").bind(key, payload, Date.now() + ttlMs).run();
  } catch {
    // A missing or read-only cache table must not fail a live search.
  }
}

async function cacheSweep(): Promise<void> {
  const db = env.DB;
  if (!db) return;
  try {
    await db.prepare("DELETE FROM discovery_cache WHERE expires_at<?").bind(Date.now()).run();
  } catch {
    /* best effort */
  }
}

/** `true` when this request may proceed; `false` when one just ran this second. */
async function claimRateSlot(): Promise<boolean> {
  const db = env.DB;
  if (!db) return true;
  try {
    const gate = await db
      .prepare("INSERT OR IGNORE INTO discovery_cache (cache_key,payload,expires_at) VALUES (?, '', ?)")
      .bind(`rate:${Math.floor(Date.now() / 1000)}`, Date.now() + RATE_WINDOW_MS)
      .run();
    return Boolean(gate.meta.changes);
  } catch {
    return true;
  }
}

export async function GET() {
  return NextResponse.json({ placesConnected: Boolean(config().GOOGLE_PLACES_API_KEY), publicDirectory: true });
}

export async function POST(request: Request) {
  if (!(await getChatGPTUser())) return NextResponse.json({ error: "Sign in to search." }, { status: 401 });

  try {
    const body = (await request.json()) as { category?: string; location?: string; radius?: number; limit?: number; provider?: string };
    const category = body.category || "all";
    const location = String(body.location || "").trim();
    const radius = Number(body.radius || 10);
    const limit = Number(body.limit || 25);
    const provider = body.provider || "public";

    if (
      !categoryTags(category) ||
      location.length < 3 ||
      location.length > 150 ||
      !(RADIUS_CHOICES as readonly number[]).includes(radius) ||
      !(LIMIT_CHOICES as readonly number[]).includes(limit) ||
      !["public", "google"].includes(provider)
    ) {
      return NextResponse.json({ error: "Choose a business category, location, radius and result limit." }, { status: 400 });
    }

    const providerOptions: ProviderOptions = { nominatimUrl: config().NOMINATIM_URL, overpassUrl: config().OVERPASS_URL };


    if (provider === "google") {
      const apiKey = config().GOOGLE_PLACES_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "Google Places is not connected. Choose Public directory to search now." }, { status: 503 });
      const results = await searchGooglePlaces({ category, location, limit, apiKey }, providerOptions);
      return NextResponse.json({ provider: "Google Places", storageAllowed: false, location, results });
    }

    const resultKey = `results:v3:${category}:${location.toLowerCase()}:${radius}:${limit}`;
    const prior = await cacheGet(resultKey);
    if (prior) {
      try {
        return NextResponse.json({ ...JSON.parse(prior), cached: true });
      } catch {
        /* fall through and search again */
      }
    }

    if (!(await claimRateSlot())) return NextResponse.json({ error: "Another search just started. Wait a few seconds and try again." }, { status: 429 });

    const geocodeKey = `geocode:${location.toLowerCase()}`;
    let points: GeoPoint[] | null = null;
    const cachedGeo = await cacheGet(geocodeKey);
    if (cachedGeo) {
      try {
        const parsed = JSON.parse(cachedGeo);
        if (Array.isArray(parsed) && parsed.length) points = parsed as GeoPoint[];
      } catch {
        /* ignore a corrupt entry */
      }
    }
    if (!points) {
      points = (await geocodeLocation(location, providerOptions)).points;
      if (points.length) await cachePut(geocodeKey, JSON.stringify(points), GEOCODE_TTL_MS);
    }

    if (!points.length) return NextResponse.json({ error: "Location not found. Include city, state and country." }, { status: 404 });
    const lat = Number(points[0].lat);
    const lon = Number(points[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new DiscoveryProviderError("Could not resolve this location. Include city, state and country.");
    }

    const search = { lat, lon, radiusKm: radius, limit, category };
    const found = await findNearbyBusinesses(search, providerOptions);
    const results = toCandidates(found.elements, search);

    await cacheSweep();
    const payload = {
      provider: "OpenStreetMap",
      directory: found.provider,
      storageAllowed: true,
      location: points[0].display_name,
      results,
      basicListings: found.basicListings,
      partial: found.partial,
    };
    if (!found.partial) await cachePut(resultKey, JSON.stringify(payload), RESULT_TTL_MS);
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof DiscoveryProviderError
        ? error.message
        : "Business search could not complete. Please try again. If this persists, connect Google Places.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
